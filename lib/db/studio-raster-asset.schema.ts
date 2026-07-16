import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { creatorWorks, users } from "./schema";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * Kept separate to avoid making the primary schema import a table that already references it.
 * `drizzle.config.ts` explicitly catalogs both schema files, while query builders can consume this
 * standalone table without introducing a circular module dependency.
 */
export const creatorWorkRasterAssets = pgTable(
  "creator_work_raster_asset",
  {
    workId: text("workId").notNull(),
    assetId: text("assetId").notNull(),
    mediaType: text("mediaType").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    payload: bytea("payload").notNull(),
    byteLength: integer("byteLength").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploadedBy"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "creator_work_raster_asset_work_fkey",
      columns: [table.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_raster_asset_uploaded_by_fkey",
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({
      name: "creator_work_raster_asset_pkey",
      columns: [table.workId, table.assetId],
    }),
    index("idx_creator_work_raster_asset_uploader_created")
      .on(table.uploadedBy, table.createdAt.desc()),
    check(
      "creator_work_raster_asset_content_address_check",
      sql`${table.assetId} = ${table.sha256}
        and ${table.assetId} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_work_raster_asset_media_type_check",
      sql`${table.mediaType} = 'image/png'`
    ),
    check(
      "creator_work_raster_asset_dimensions_check",
      sql`${table.width} between 1 and 1024
        and ${table.height} between 1 and 1024`
    ),
    check(
      "creator_work_raster_asset_byte_length_check",
      sql`${table.byteLength} between 1 and 16777216`
    ),
    check(
      "creator_work_raster_asset_payload_size_check",
      sql`octet_length(${table.payload}) = ${table.byteLength}`
    ),
  ]
);
