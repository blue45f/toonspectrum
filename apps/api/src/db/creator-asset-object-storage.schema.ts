import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { creatorWorkAssets, creatorWorks, users } from "./schema";

export const creatorAssetStorageObjects = pgTable(
  "creator_asset_storage_object",
  {
    purpose: text("purpose").notNull(),
    digest: text("digest").notNull(),
    contractVersion: text("contractVersion").notNull(),
    providerId: text("providerId").notNull(),
    objectPath: text("objectPath").notNull(),
    byteLength: bigint("byteLength", { mode: "number" }).notNull(),
    contentType: text("contentType").notNull(),
    state: text("state").notNull().default("active"),
    deleteToken: text("deleteToken"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "creator_asset_storage_object_pkey",
      columns: [table.purpose, table.digest],
    }),
    uniqueIndex("creator_asset_storage_object_path_unique").on(
      table.purpose,
      table.objectPath,
    ),
    check(
      "creator_asset_storage_object_contract_check",
      sql`${table.contractVersion} = 'toonspectrum.private-object-storage.v2'`,
    ),
    check(
      "creator_asset_storage_object_purpose_check",
      sql`${table.purpose} in ('source', 'derived', 'export')`,
    ),
    check(
      "creator_asset_storage_object_provider_check",
      sql`${table.providerId} in ('supabase', 'cloudflare-r2', 'backblaze-b2')`,
    ),
    check(
      "creator_asset_storage_object_digest_path_check",
      sql`${table.digest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.objectPath} =
          'sha256/' || substring(${table.digest} from 8 for 2) || '/' ||
          substring(${table.digest} from 8)`,
    ),
    check(
      "creator_asset_storage_object_byte_length_check",
      sql`${table.byteLength} between 1 and 5368709120`,
    ),
    check(
      "creator_asset_storage_object_content_type_check",
      sql`length(${table.contentType}) between 3 and 160
        and ${table.contentType} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'`,
    ),
    check(
      "creator_asset_storage_object_state_check",
      sql`${table.state} in ('active', 'deleting', 'deleted')`,
    ),
    check(
      "creator_asset_storage_object_source_retention_check",
      sql`${table.purpose} <> 'source' or ${table.state} = 'active'`,
    ),
    check(
      "creator_asset_storage_object_lifecycle_check",
      sql`(
          ${table.state} = 'active'
          and ${table.deleteToken} is null
          and ${table.deletedAt} is null
        ) or (
          ${table.state} = 'deleting'
          and ${table.purpose} in ('derived', 'export')
          and ${table.deleteToken} ~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and ${table.deletedAt} is null
        ) or (
          ${table.state} = 'deleted'
          and ${table.purpose} in ('derived', 'export')
          and ${table.deleteToken} is null
          and ${table.deletedAt} is not null
        )`,
    ),
  ],
);

export const creatorWorkAssetStorageReferences = pgTable(
  "creator_work_asset_storage_reference",
  {
    workId: text("workId").notNull(),
    purpose: text("purpose").notNull(),
    referenceId: text("referenceId").notNull(),
    objectDigest: text("objectDigest").notNull(),
    sourceAssetId: text("sourceAssetId").notNull(),
    state: text("state").notNull().default("active"),
    deleteToken: text("deleteToken"),
    createdBy: text("createdBy"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "creator_work_asset_storage_reference_pkey",
      columns: [table.workId, table.purpose, table.referenceId],
    }),
    foreignKey({
      name: "creator_work_asset_storage_reference_asset_fkey",
      columns: [table.workId, table.sourceAssetId],
      foreignColumns: [creatorWorkAssets.workId, creatorWorkAssets.assetId],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_asset_storage_reference_object_fkey",
      columns: [table.purpose, table.objectDigest],
      foreignColumns: [
        creatorAssetStorageObjects.purpose,
        creatorAssetStorageObjects.digest,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "creator_work_asset_storage_reference_created_by_fkey",
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    index("idx_creator_work_asset_storage_reference_object").on(
      table.purpose,
      table.objectDigest,
      table.state,
    ),
    index("idx_creator_work_asset_storage_reference_source").on(
      table.workId,
      table.sourceAssetId,
    ),
    check(
      "creator_work_asset_storage_reference_purpose_check",
      sql`${table.purpose} in ('source', 'derived', 'export')`,
    ),
    check(
      "creator_work_asset_storage_reference_id_check",
      sql`length(${table.referenceId}) between 1 and 160
        and ${table.referenceId} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_work_asset_storage_reference_digest_check",
      sql`${table.objectDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_work_asset_storage_reference_source_binding_check",
      sql`${table.purpose} <> 'source'
        or ${table.referenceId} = ${table.sourceAssetId}`,
    ),
    check(
      "creator_work_asset_storage_reference_lifecycle_check",
      sql`(
          ${table.state} = 'active'
          and ${table.deleteToken} is null
        ) or (
          ${table.state} = 'deleting'
          and ${table.purpose} in ('derived', 'export')
          and ${table.deleteToken} ~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )`,
    ),
  ],
);

/**
 * Immutable publication media references. A work can retain multiple digests for the same slot so
 * an already-published revision keeps resolving while a replacement upload is prepared. The
 * current creator_work cover/pages fields select the active digest through their immutable route.
 */
export const creatorWorkPublicationMedia = pgTable(
  "creator_work_publication_media",
  {
    workId: text("workId").notNull(),
    slot: text("slot").notNull(),
    pageIndex: integer("pageIndex"),
    purpose: text("purpose").notNull().default("export"),
    objectDigest: text("objectDigest").notNull(),
    mediaType: text("mediaType").notNull(),
    byteLength: bigint("byteLength", { mode: "number" }).notNull(),
    createdBy: text("createdBy"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "creator_work_publication_media_pkey",
      columns: [table.workId, table.slot, table.objectDigest],
    }),
    foreignKey({
      name: "creator_work_publication_media_work_fkey",
      columns: [table.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_publication_media_object_fkey",
      columns: [table.purpose, table.objectDigest],
      foreignColumns: [
        creatorAssetStorageObjects.purpose,
        creatorAssetStorageObjects.digest,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "creator_work_publication_media_created_by_fkey",
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    index("idx_creator_work_publication_media_object").on(
      table.purpose,
      table.objectDigest,
    ),
    index("idx_creator_work_publication_media_work_created").on(
      table.workId,
      table.createdAt.desc(),
    ),
    check(
      "creator_work_publication_media_purpose_check",
      sql`${table.purpose} = 'export'`,
    ),
    check(
      "creator_work_publication_media_slot_check",
      sql`(
        ${table.slot} = 'cover' AND ${table.pageIndex} IS NULL
      ) OR (
        ${table.slot} ~ '^page:[0-9]+$'
        AND ${table.pageIndex} BETWEEN 0 AND 9999
        AND ${table.slot} = 'page:' || ${table.pageIndex}::text
      )`,
    ),
    check(
      "creator_work_publication_media_digest_check",
      sql`${table.objectDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_work_publication_media_type_check",
      sql`${table.mediaType} IN (
        'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'
      )`,
    ),
    check(
      "creator_work_publication_media_byte_length_check",
      sql`${table.byteLength} BETWEEN 1 AND 33554432`,
    ),
  ],
);

/**
 * Verified secondary copies are inventory only. The primary provider remains
 * immutable on creator_asset_storage_object, so a replica can never become an
 * implicit write target or a split-brain authority. Promotion requires an
 * explicit operator-gated migration.
 */
export const creatorAssetStorageReplicas = pgTable(
  "creator_asset_storage_replica",
  {
    purpose: text("purpose").notNull(),
    objectDigest: text("objectDigest").notNull(),
    providerId: text("providerId").notNull(),
    objectPath: text("objectPath").notNull(),
    byteLength: bigint("byteLength", { mode: "number" }).notNull(),
    contentType: text("contentType").notNull(),
    state: text("state").notNull().default("active"),
    verifiedAt: timestamp("verifiedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "creator_asset_storage_replica_pkey",
      columns: [table.purpose, table.objectDigest, table.providerId],
    }),
    foreignKey({
      name: "creator_asset_storage_replica_object_fkey",
      columns: [table.purpose, table.objectDigest],
      foreignColumns: [
        creatorAssetStorageObjects.purpose,
        creatorAssetStorageObjects.digest,
      ],
    }).onDelete("cascade"),
    uniqueIndex("creator_asset_storage_replica_path_unique").on(
      table.providerId,
      table.purpose,
      table.objectPath,
    ),
    index("idx_creator_asset_storage_replica_state").on(
      table.providerId,
      table.state,
      table.updatedAt,
    ),
    check(
      "creator_asset_storage_replica_purpose_check",
      sql`${table.purpose} in ('source', 'derived', 'export')`,
    ),
    check(
      "creator_asset_storage_replica_provider_check",
      sql`${table.providerId} in ('supabase', 'cloudflare-r2', 'backblaze-b2')`,
    ),
    check(
      "creator_asset_storage_replica_digest_path_check",
      sql`${table.objectDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.objectPath} =
          'sha256/' || substring(${table.objectDigest} from 8 for 2) || '/' ||
          substring(${table.objectDigest} from 8)`,
    ),
    check(
      "creator_asset_storage_replica_byte_length_check",
      sql`${table.byteLength} between 1 and 5368709120`,
    ),
    check(
      "creator_asset_storage_replica_content_type_check",
      sql`length(${table.contentType}) between 3 and 160
        and ${table.contentType} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'`,
    ),
    check(
      "creator_asset_storage_replica_state_check",
      sql`${table.state} in ('active', 'deleting', 'deleted')`,
    ),
    check(
      "creator_asset_storage_replica_lifecycle_check",
      sql`(
          ${table.state} in ('active', 'deleting')
          and ${table.deletedAt} is null
        ) or (
          ${table.state} = 'deleted'
          and ${table.deletedAt} is not null
        )`,
    ),
  ],
);
