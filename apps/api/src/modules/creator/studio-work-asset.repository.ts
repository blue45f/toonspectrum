import { and, count, eq, inArray, sql } from "drizzle-orm";
import * as Y from "yjs";

import {
  creatorWorkAssets,
  creatorWorkAssetTombstones,
  creatorWorkCollaborators,
  creatorWorks,
  db,
} from "../../../../../lib/db";
import {
  STUDIO_WORK_ASSET_CONTRACT_VERSION,
  STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK,
  STUDIO_WORK_ASSET_MAX_TOMBSTONES_PER_WORK,
  STUDIO_WORK_ASSET_MAX_TOTAL_BYTES_PER_WORK,
} from "../../../../../lib/studio-work-asset-contract";

import { resolveCreatorCollaborationAccess } from "./creator-collaboration.policy";
import {
  loadStudioCrdtDocumentInTransaction,
  withStudioCrdtWorkMutationLock,
} from "./studio-crdt.repository";

import type {
  CreatorCollaborationAccess,
  CreatorCollaborationMembershipLike,
} from "./creator-collaboration.policy";
import type {
  DrizzleStudioCrdtTransaction,
  StudioCrdtHydrationState,
} from "./studio-crdt.repository";
import type {
  StudioWorkAssetDescriptor,
  StudioWorkAssetIntrinsicImage,
  StudioWorkAssetManifest,
  StudioWorkAssetType,
} from "../../../../../lib/studio-work-asset-contract";

export const STUDIO_WORK_ASSET_REPOSITORY = Symbol("STUDIO_WORK_ASSET_REPOSITORY");

type DrizzleStudioWorkAssetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class StudioWorkAssetNotFoundError extends Error {
  constructor() {
    super("studio_work_asset_not_found");
    this.name = "StudioWorkAssetNotFoundError";
  }
}

export class StudioWorkAssetForbiddenError extends Error {
  constructor(readonly operation: "view" | "edit") {
    super(`studio_work_asset_${operation}_forbidden`);
    this.name = "StudioWorkAssetForbiddenError";
  }
}

export class StudioWorkAssetTypeConflictError extends Error {
  constructor() {
    super("studio_work_asset_type_conflict");
    this.name = "StudioWorkAssetTypeConflictError";
  }
}

export class StudioWorkAssetImmutableConflictError extends Error {
  constructor() {
    super("studio_work_asset_immutable_conflict");
    this.name = "StudioWorkAssetImmutableConflictError";
  }
}

export class StudioWorkAssetQuotaError extends Error {
  constructor(readonly quota: "count" | "bytes" | "tombstones") {
    super(`studio_work_asset_${quota}_quota`);
    this.name = "StudioWorkAssetQuotaError";
  }
}

export class StudioWorkAssetCleanupOwnershipError extends Error {
  constructor() {
    super("studio_work_asset_cleanup_ownership");
    this.name = "StudioWorkAssetCleanupOwnershipError";
  }
}

export class StudioWorkAssetReferencedError extends Error {
  constructor() {
    super("studio_work_asset_referenced");
    this.name = "StudioWorkAssetReferencedError";
  }
}

export interface StudioWorkAssetWrite {
  workId: string;
  assetId: string;
  elementType: StudioWorkAssetType;
  mimeType: StudioWorkAssetManifest["mimeType"];
  descriptor: StudioWorkAssetDescriptor;
  payload: Uint8Array;
  sha256: string;
  intrinsicImage: StudioWorkAssetIntrinsicImage | null;
}

export interface StudioWorkAssetContent {
  manifest: StudioWorkAssetManifest;
  payload: Uint8Array;
}

export interface StudioWorkAssetRepository {
  upsert(actorUserId: string, input: StudioWorkAssetWrite): Promise<StudioWorkAssetManifest>;
  getManifest(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType
  ): Promise<StudioWorkAssetManifest>;
  getManifests(
    actorUserId: string,
    workId: string,
    assetIds: readonly string[]
  ): Promise<readonly StudioWorkAssetManifest[]>;
  getManifestsInTransaction(
    transaction: DrizzleStudioCrdtTransaction,
    actorUserId: string,
    workId: string,
    assetIds: readonly string[]
  ): Promise<readonly StudioWorkAssetManifest[]>;
  getContent(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType
  ): Promise<StudioWorkAssetContent>;
  deleteUnreferencedUpload(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType,
    expectedSha256: string
  ): Promise<boolean>;
}

export interface StudioWorkAssetCleanupCandidate {
  elementType: string;
  sha256: string;
  uploadedBy: string | null;
}

/**
 * A cleanup request is a receipt-bound compensation, not a general asset delete. Mismatched
 * identity receipts are idempotent no-ops; another uploader or any durable reference fails
 * closed. Durable references remain protected even after their scene element is marked deleted,
 * because that retained identity can still be reached by another replica or an undo frontier.
 */
export function planStudioWorkAssetOrphanCleanup(input: {
  existing: StudioWorkAssetCleanupCandidate | null;
  actorUserId: string;
  elementType: StudioWorkAssetType;
  expectedSha256: string;
  durablyReferenced: boolean;
}): boolean {
  if (
    !input.existing ||
    input.existing.elementType !== input.elementType ||
    input.existing.sha256 !== input.expectedSha256
  ) return false;
  if (input.existing.uploadedBy !== input.actorUserId) {
    throw new StudioWorkAssetCleanupOwnershipError();
  }
  if (input.durablyReferenced) throw new StudioWorkAssetReferencedError();
  return true;
}

/**
 * Replays the exact retained server frontier and checks for the asset's materialized scene root.
 * The check intentionally ignores the current `deleted` flag: once an identity entered the
 * durable Yjs document it is no longer eligible for upload-race compensation.
 */
export function studioCrdtHydrationReferencesWorkAsset(
  state: StudioCrdtHydrationState,
  assetId: string
): boolean {
  const document = new Y.Doc({ gc: false });
  try {
    if (state.snapshot) {
      Y.applyUpdate(document, state.snapshot.snapshot, "work-asset-cleanup-snapshot");
    }
    for (const update of state.updates) {
      Y.applyUpdate(document, update.payload, "work-asset-cleanup-update");
    }
    const rootName = `scene-element:${encodeURIComponent(assetId)}`;
    if (!document.share.has(rootName)) return false;
    const root = document.getMap<unknown>(rootName);
    return root.get("type") === "reference";
  } finally {
    document.destroy();
  }
}

export function isStudioWorkAssetIdempotentReplay(
  existing: Pick<StudioWorkAssetWrite, "elementType" | "sha256" | "descriptor" | "intrinsicImage">,
  incoming: Pick<StudioWorkAssetWrite, "elementType" | "sha256" | "descriptor" | "intrinsicImage">
): boolean {
  return existing.elementType === incoming.elementType &&
    existing.sha256 === incoming.sha256 &&
    JSON.stringify(existing.descriptor) === JSON.stringify(incoming.descriptor) &&
    JSON.stringify(existing.intrinsicImage) === JSON.stringify(incoming.intrinsicImage);
}

export function assertStudioWorkAssetIdNotReserved(reserved: boolean): void {
  if (reserved) throw new StudioWorkAssetImmutableConflictError();
}

export function planStudioWorkAssetDeletion(
  existingType: string | null,
  requestedType: StudioWorkAssetType,
  tombstoneCount: number
): boolean {
  if (existingType !== requestedType) return false;
  if (
    !Number.isSafeInteger(tombstoneCount) || tombstoneCount < 0 ||
    tombstoneCount >= STUDIO_WORK_ASSET_MAX_TOMBSTONES_PER_WORK
  ) {
    throw new StudioWorkAssetQuotaError("tombstones");
  }
  return true;
}

function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function manifestFrom(row: typeof creatorWorkAssets.$inferSelect): StudioWorkAssetManifest {
  return {
    version: STUDIO_WORK_ASSET_CONTRACT_VERSION,
    assetId: row.assetId,
    elementType: row.elementType as StudioWorkAssetType,
    mimeType: row.mimeType as StudioWorkAssetManifest["mimeType"],
    byteSize: row.byteSize,
    sha256: row.sha256,
    intrinsicImage: row.elementType === "image" ? {
      width: row.intrinsicWidth!,
      height: row.intrinsicHeight!,
      decodedRgbaBytes: row.decodedRgbaBytes!,
    } : null,
    descriptor: row.descriptor,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function resolveStudioWorkAssetAccess(input: {
  actorUserId: string;
  ownerUserId: string;
  membership?: CreatorCollaborationMembershipLike | null;
}): Pick<CreatorCollaborationAccess, "view" | "edit"> {
  const access = resolveCreatorCollaborationAccess(input);
  return { view: access.view, edit: access.edit };
}

async function workAccess(
  transaction: DrizzleStudioWorkAssetTransaction,
  actorUserId: string,
  workId: string,
  lock: boolean
): Promise<Pick<CreatorCollaborationAccess, "view" | "edit">> {
  let workQuery = transaction
    .select({ ownerUserId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  if (lock) workQuery = workQuery.for("update") as typeof workQuery;
  const [work] = await workQuery;
  if (!work) throw new StudioWorkAssetNotFoundError();

  const [membership] = actorUserId === work.ownerUserId
    ? []
    : await transaction
        .select({
          userId: creatorWorkCollaborators.userId,
          role: creatorWorkCollaborators.role,
          status: creatorWorkCollaborators.status,
        })
        .from(creatorWorkCollaborators)
        .where(
          and(
            eq(creatorWorkCollaborators.workId, workId),
            eq(creatorWorkCollaborators.userId, actorUserId)
          )
        )
        .limit(1);
  return resolveStudioWorkAssetAccess({
    actorUserId,
    ownerUserId: work.ownerUserId,
    membership: membership ?? null,
  });
}

async function requireAccess(
  transaction: DrizzleStudioWorkAssetTransaction,
  actorUserId: string,
  workId: string,
  operation: "view" | "edit",
  lock: boolean
): Promise<void> {
  const access = await workAccess(transaction, actorUserId, workId, lock);
  if (!access[operation]) throw new StudioWorkAssetForbiddenError(operation);
}

async function readAsset(
  transaction: DrizzleStudioWorkAssetTransaction,
  actorUserId: string,
  workId: string,
  assetId: string,
  elementType: StudioWorkAssetType
): Promise<typeof creatorWorkAssets.$inferSelect> {
  await requireAccess(transaction, actorUserId, workId, "view", false);
  const [row] = await transaction
    .select()
    .from(creatorWorkAssets)
    .where(
      and(
        eq(creatorWorkAssets.workId, workId),
        eq(creatorWorkAssets.assetId, assetId),
        eq(creatorWorkAssets.elementType, elementType)
      )
    )
    .limit(1);
  // Missing and same-ID/wrong-type rows are deliberately indistinguishable to readers.
  if (!row) throw new StudioWorkAssetNotFoundError();
  return row;
}

/**
 * Work rows are the serialization fence shared with collaboration role mutations. Upload and both
 * cleanup primitives lock that row before checking edit access, so a concurrent downgrade can
 * never race an asset mutation through an older permission snapshot.
 */
export class DrizzleStudioWorkAssetRepository implements StudioWorkAssetRepository {
  async upsert(
    actorUserId: string,
    input: StudioWorkAssetWrite
  ): Promise<StudioWorkAssetManifest> {
    return db.transaction(async (transaction) => {
      await requireAccess(transaction, actorUserId, input.workId, "edit", true);
      const [reserved] = await transaction
        .select({ assetId: creatorWorkAssetTombstones.assetId })
        .from(creatorWorkAssetTombstones)
        .where(
          and(
            eq(creatorWorkAssetTombstones.workId, input.workId),
            eq(creatorWorkAssetTombstones.assetId, input.assetId)
          )
        )
        .limit(1);
      assertStudioWorkAssetIdNotReserved(Boolean(reserved));
      const [existing] = await transaction
        .select()
        .from(creatorWorkAssets)
        .where(
          and(
            eq(creatorWorkAssets.workId, input.workId),
            eq(creatorWorkAssets.assetId, input.assetId)
          )
        )
        .limit(1);
      if (existing && existing.elementType !== input.elementType) {
        throw new StudioWorkAssetTypeConflictError();
      }
      if (existing) {
        if (!isStudioWorkAssetIdempotentReplay({
          elementType: existing.elementType as StudioWorkAssetType,
          sha256: existing.sha256,
          descriptor: existing.descriptor,
          intrinsicImage: existing.elementType === "image" ? {
            width: existing.intrinsicWidth!,
            height: existing.intrinsicHeight!,
            decodedRgbaBytes: existing.decodedRgbaBytes!,
          } : null,
        }, input)) {
          // CRDT references intentionally carry no content version. Keeping an asset ID immutable
          // prevents already-hydrated peers from silently retaining a different body. A changed
          // body/descriptor must be published under a fresh element/asset ID and then referenced
          // by a normal scene operation.
          throw new StudioWorkAssetImmutableConflictError();
        }
        return manifestFrom(existing);
      }

      const [usage] = await transaction
        .select({
          assetCount: count(),
          totalBytes: sql<number>`coalesce(sum(${creatorWorkAssets.byteSize}), 0)`,
        })
        .from(creatorWorkAssets)
        .where(eq(creatorWorkAssets.workId, input.workId));
      const assetCount = Number(usage?.assetCount ?? 0);
      const nextTotalBytes = Number(usage?.totalBytes ?? 0) + input.payload.byteLength;
      if (assetCount >= STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK) {
        throw new StudioWorkAssetQuotaError("count");
      }
      if (
        !Number.isSafeInteger(nextTotalBytes) ||
        nextTotalBytes > STUDIO_WORK_ASSET_MAX_TOTAL_BYTES_PER_WORK
      ) {
        throw new StudioWorkAssetQuotaError("bytes");
      }

      const values = {
        workId: input.workId,
        assetId: input.assetId,
        elementType: input.elementType,
        mimeType: input.mimeType,
        descriptor: input.descriptor,
        payload: copyBytes(input.payload),
        byteSize: input.payload.byteLength,
        sha256: input.sha256,
        intrinsicWidth: input.intrinsicImage?.width ?? null,
        intrinsicHeight: input.intrinsicImage?.height ?? null,
        decodedRgbaBytes: input.intrinsicImage?.decodedRgbaBytes ?? null,
        uploadedBy: actorUserId,
        updatedAt: sql`now()`,
      };
      const [stored] = await transaction
        .insert(creatorWorkAssets)
        .values(values)
        .returning();
      if (!stored) throw new Error("studio work asset upsert returned no row");
      return manifestFrom(stored);
    });
  }

  async getManifest(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType
  ): Promise<StudioWorkAssetManifest> {
    return db.transaction(
      async (transaction) => manifestFrom(
        await readAsset(transaction, actorUserId, workId, assetId, elementType)
      ),
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async getManifests(
    actorUserId: string,
    workId: string,
    assetIds: readonly string[]
  ): Promise<readonly StudioWorkAssetManifest[]> {
    if (assetIds.length === 0) return [];
    return db.transaction(
      (transaction) => this.getManifestsInTransaction(
        transaction,
        actorUserId,
        workId,
        assetIds
      ),
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async getManifestsInTransaction(
    transaction: DrizzleStudioCrdtTransaction,
    actorUserId: string,
    workId: string,
    assetIds: readonly string[]
  ): Promise<readonly StudioWorkAssetManifest[]> {
    if (assetIds.length === 0) return [];
    await requireAccess(transaction, actorUserId, workId, "view", false);
    const rows = await transaction
      .select()
      .from(creatorWorkAssets)
      .where(
        and(
          eq(creatorWorkAssets.workId, workId),
          inArray(creatorWorkAssets.assetId, [...new Set(assetIds)])
        )
      );
    return rows.map(manifestFrom);
  }

  async getContent(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType
  ): Promise<StudioWorkAssetContent> {
    return db.transaction(
      async (transaction) => {
        const row = await readAsset(transaction, actorUserId, workId, assetId, elementType);
        return { manifest: manifestFrom(row), payload: copyBytes(row.payload) };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async deleteUnreferencedUpload(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType,
    expectedSha256: string
  ): Promise<boolean> {
    return db.transaction((transaction) =>
      withStudioCrdtWorkMutationLock(transaction, workId, async () => {
        // Append/compaction and this proof share one serialization fence. A reference cannot be
        // admitted between the replay below and the physical delete.
        await requireAccess(transaction, actorUserId, workId, "edit", true);
        const [existing] = await transaction
          .select({
            elementType: creatorWorkAssets.elementType,
            sha256: creatorWorkAssets.sha256,
            uploadedBy: creatorWorkAssets.uploadedBy,
          })
          .from(creatorWorkAssets)
          .where(
            and(
              eq(creatorWorkAssets.workId, workId),
              eq(creatorWorkAssets.assetId, assetId)
            )
          )
          .limit(1);
        if (
          !existing ||
          existing.elementType !== elementType ||
          existing.sha256 !== expectedSha256
        ) return false;

        const durable = await loadStudioCrdtDocumentInTransaction(transaction, workId);
        if (!planStudioWorkAssetOrphanCleanup({
          existing,
          actorUserId,
          elementType,
          expectedSha256,
          durablyReferenced: studioCrdtHydrationReferencesWorkAsset(durable, assetId),
        })) return false;

        // This special compensation does not write a tombstone: the proof above establishes that
        // the ID never entered the durable collaboration frontier, so the same local element may
        // safely retry after its source changes. General/reference-aware deletion remains closed.
        const deleted = await transaction
          .delete(creatorWorkAssets)
          .where(
            and(
              eq(creatorWorkAssets.workId, workId),
              eq(creatorWorkAssets.assetId, assetId),
              eq(creatorWorkAssets.elementType, elementType),
              eq(creatorWorkAssets.sha256, expectedSha256),
              eq(creatorWorkAssets.uploadedBy, actorUserId)
            )
          )
          .returning({ assetId: creatorWorkAssets.assetId });
        return deleted.length > 0;
      })
    );
  }

  /**
   * Low-level maintenance primitive only. It is intentionally absent from the injected repository
   * interface and has no controller/service route until trusted CRDT-reference-aware GC exists.
   */
  async deleteInternalForTrustedGarbageCollection(
    actorUserId: string,
    workId: string,
    assetId: string,
    elementType: StudioWorkAssetType
  ): Promise<boolean> {
    return db.transaction(async (transaction) => {
      await requireAccess(transaction, actorUserId, workId, "edit", true);
      const [existing] = await transaction
        .select({
          assetId: creatorWorkAssets.assetId,
          elementType: creatorWorkAssets.elementType,
        })
        .from(creatorWorkAssets)
        .where(
          and(
            eq(creatorWorkAssets.workId, workId),
            eq(creatorWorkAssets.assetId, assetId)
          )
        )
        .limit(1);
      if (!existing || existing.elementType !== elementType) return false;
      const [usage] = await transaction
        .select({ tombstoneCount: count() })
        .from(creatorWorkAssetTombstones)
        .where(eq(creatorWorkAssetTombstones.workId, workId));
      if (!planStudioWorkAssetDeletion(
        existing.elementType,
        elementType,
        Number(usage?.tombstoneCount ?? 0)
      )) return false;
      await transaction.insert(creatorWorkAssetTombstones).values({
        workId,
        assetId,
        elementType,
        deletedBy: actorUserId,
      });
      const deleted = await transaction
        .delete(creatorWorkAssets)
        .where(
          and(
            eq(creatorWorkAssets.workId, workId),
            eq(creatorWorkAssets.assetId, assetId),
            eq(creatorWorkAssets.elementType, elementType)
          )
        )
        .returning({ assetId: creatorWorkAssets.assetId });
      return deleted.length > 0;
    });
  }
}

export const studioWorkAssetRepositoryProvider = {
  provide: STUDIO_WORK_ASSET_REPOSITORY,
  useFactory: (): StudioWorkAssetRepository => new DrizzleStudioWorkAssetRepository(),
};
