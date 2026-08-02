import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { creatorWorkAssets, users } from "./schema";

export const creatorAssetStorageObjects = pgTable(
  "creator_asset_storage_object",
  {
    purpose: text("purpose").notNull(),
    digest: text("digest").notNull(),
    contractVersion: text("contractVersion").notNull(),
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
      sql`${table.contractVersion} = 'toonspectrum.supabase-object-storage.v1'`,
    ),
    check(
      "creator_asset_storage_object_purpose_check",
      sql`${table.purpose} in ('source', 'derived', 'export')`,
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
