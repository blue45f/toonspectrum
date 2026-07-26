import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { db, users } from "../../../../../lib/db";
import { creatorMarketplaceResources } from "../../../../../lib/db/creator-marketplace-resource.schema";

import {
  CREATOR_MARKETPLACE_RESOURCE_REPOSITORY,
  CreatorMarketplaceResourceDuplicateError,
} from "./creator-marketplace.repository-contract";

import type {
  CreatorMarketplaceResourceListInput,
  CreatorMarketplaceResourcePublishInput,
  CreatorMarketplaceResourceRepository,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type { Provider } from "@nestjs/common";
import type { SQL } from "drizzle-orm";

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function mapStoredRow(row: {
  id: string;
  publisherId: string;
  publisherName: string | null;
  publisherAvatar: string | null;
  manifest: CreatorMarketplaceResourceStoredRow["manifest"];
  manifestHash: string;
  manifestByteSize: number;
  createdAt: Date;
  updatedAt: Date;
}): CreatorMarketplaceResourceStoredRow {
  return row;
}

export class DrizzleCreatorMarketplaceResourceRepository
  implements CreatorMarketplaceResourceRepository
{
  async list(
    input: CreatorMarketplaceResourceListInput
  ): Promise<readonly CreatorMarketplaceResourceStoredRow[]> {
    const filters: SQL[] = [eq(creatorMarketplaceResources.hidden, false)];
    if (input.publisherId) {
      filters.push(eq(creatorMarketplaceResources.publisherId, input.publisherId));
    }
    if (input.kind) filters.push(eq(creatorMarketplaceResources.kind, input.kind));
    if (input.license) filters.push(eq(creatorMarketplaceResources.license, input.license));
    if (input.tag) {
      filters.push(
        sql`${creatorMarketplaceResources.tags} @> ${JSON.stringify([input.tag])}::jsonb`
      );
    }
    if (input.search) {
      const pattern = `%${escapeLikePattern(input.search)}%`;
      filters.push(
        // This expression intentionally mirrors the lower-cased generated searchText column in
        // migration 0022. pg_trgm keeps partial, Korean, tag, and package-id searches indexable.
        sql`${creatorMarketplaceResources.searchText} LIKE lower(${pattern}) ESCAPE '\\'`
      );
    }
    if (input.cursor) {
      filters.push(
        or(
          lt(creatorMarketplaceResources.createdAt, input.cursor.createdAt),
          and(
            eq(creatorMarketplaceResources.createdAt, input.cursor.createdAt),
            lt(creatorMarketplaceResources.id, input.cursor.id)
          )
        )!
      );
    }

    const rows = await db
      .select({
        id: creatorMarketplaceResources.id,
        publisherId: creatorMarketplaceResources.publisherId,
        publisherName: users.name,
        publisherAvatar: users.avatar,
        manifest: creatorMarketplaceResources.manifest,
        manifestHash: creatorMarketplaceResources.manifestHash,
        manifestByteSize: creatorMarketplaceResources.manifestByteSize,
        createdAt: creatorMarketplaceResources.createdAt,
        updatedAt: creatorMarketplaceResources.updatedAt,
      })
      .from(creatorMarketplaceResources)
      .leftJoin(users, eq(creatorMarketplaceResources.publisherId, users.id))
      .where(and(...filters))
      .orderBy(
        desc(creatorMarketplaceResources.createdAt),
        desc(creatorMarketplaceResources.id)
      )
      .limit(input.limit + 1);

    return rows.map(mapStoredRow);
  }

  async publish(
    input: CreatorMarketplaceResourcePublishInput
  ): Promise<CreatorMarketplaceResourceStoredRow> {
    const [inserted] = await db
      .insert(creatorMarketplaceResources)
      .values({
        id: input.id,
        publisherId: input.publisherId,
        packageId: input.manifest.packageId,
        name: input.manifest.name,
        description: input.manifest.description,
        tags: input.manifest.tags,
        kind: input.manifest.kind,
        resourceVersion: input.manifest.resourceVersion,
        minimumStudioVersion: input.manifest.minimumStudioVersion,
        license: input.manifest.license,
        provenanceOrigin: input.manifest.provenance.origin,
        manifest: input.manifest,
        manifestHash: input.manifestHash,
        manifestByteSize: input.manifestByteSize,
      })
      .onConflictDoNothing()
      .returning({
        id: creatorMarketplaceResources.id,
        publisherId: creatorMarketplaceResources.publisherId,
        manifest: creatorMarketplaceResources.manifest,
        manifestHash: creatorMarketplaceResources.manifestHash,
        manifestByteSize: creatorMarketplaceResources.manifestByteSize,
        createdAt: creatorMarketplaceResources.createdAt,
        updatedAt: creatorMarketplaceResources.updatedAt,
      });
    if (!inserted) throw new CreatorMarketplaceResourceDuplicateError();

    const [publisher] = await db
      .select({ name: users.name, avatar: users.avatar })
      .from(users)
      .where(and(eq(users.id, input.publisherId), isNotNull(users.id)))
      .limit(1);

    return mapStoredRow({
      ...inserted,
      publisherName: publisher?.name ?? null,
      publisherAvatar: publisher?.avatar ?? null,
    });
  }

  async deleteOwned(publisherId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(creatorMarketplaceResources)
      .where(
        and(
          eq(creatorMarketplaceResources.id, id),
          eq(creatorMarketplaceResources.publisherId, publisherId)
        )
      )
      .returning({ id: creatorMarketplaceResources.id });
    return deleted.length === 1;
  }
}

export const creatorMarketplaceResourceRepositoryProvider: Provider = {
  provide: CREATOR_MARKETPLACE_RESOURCE_REPOSITORY,
  useClass: DrizzleCreatorMarketplaceResourceRepository,
};
