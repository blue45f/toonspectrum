import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES,
} from "../creator-marketplace-resource-contract";

import { users } from "./schema";

import type {
  CreatorMarketplaceResourceManifest,
} from "../creator-marketplace-resource-contract";

// Drizzle parameterizes primitive `${value}` interpolations as `$1`. PostgreSQL does not accept
// parameters inside a CHECK constraint created by `drizzle-kit push`, so render this trusted,
// compile-time integer as a literal. Never replace this with request- or environment-derived text.
const CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES_SQL = sql.raw(
  String(CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES)
);

/**
 * Marketplace rows deliberately store only a bounded declarative manifest. Raster/model binaries
 * remain in the existing private work-asset or static built-in pipelines, keeping public catalog
 * reads cheap and preventing this table from becoming an unbounded blob store.
 */
export const creatorMarketplaceResources = pgTable(
  "creator_marketplace_resource",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publisherId: text("publisherId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: text("packageId").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    kind: text("kind").notNull(),
    resourceVersion: text("resourceVersion").notNull(),
    minimumStudioVersion: text("minimumStudioVersion").notNull(),
    license: text("license").notNull(),
    provenanceOrigin: text("provenanceOrigin").notNull(),
    manifest: jsonb("manifest").$type<CreatorMarketplaceResourceManifest>().notNull(),
    manifestHash: text("manifestHash").notNull(),
    manifestByteSize: integer("manifestByteSize").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    // Lower-cased, bounded metadata projection for pg_trgm. The manifest contract caps every
    // contributing field; binary/resource bodies are never copied into this search index.
    searchText: text("searchText").generatedAlwaysAs(
      sql`lower(
        "name"
        || ' ' || "description"
        || ' ' || "packageId"
        || ' ' || "tags"::text
      )`
    ),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_marketplace_resource_publisher_package_version_unique").on(
      table.publisherId,
      table.packageId,
      table.resourceVersion
    ),
    uniqueIndex("creator_marketplace_resource_publisher_manifest_hash_unique").on(
      table.publisherId,
      table.manifestHash
    ),
    index("idx_creator_marketplace_resource_catalog").on(
      table.hidden,
      table.kind,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("idx_creator_marketplace_resource_publisher").on(
      table.publisherId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("idx_creator_marketplace_resource_search")
      .using("gin", table.searchText.asc().op("gin_trgm_ops"))
      .where(sql`${table.hidden} = false`),
    index("idx_creator_marketplace_resource_tags")
      .using("gin", table.tags.asc().op("jsonb_path_ops"))
      .where(sql`${table.hidden} = false`),
    check(
      "creator_marketplace_resource_kind_check",
      sql`${table.kind} in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')`
    ),
    check(
      "creator_marketplace_resource_license_check",
      sql`${table.license} in ('toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')`
    ),
    check(
      "creator_marketplace_resource_origin_check",
      sql`${table.provenanceOrigin} in ('original', 'permissive')`
    ),
    check(
      "creator_marketplace_resource_package_id_check",
      sql`${table.packageId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'`
    ),
    check(
      "creator_marketplace_resource_version_check",
      sql`${table.resourceVersion} ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
        and ${table.minimumStudioVersion} ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'`
    ),
    check(
      "creator_marketplace_resource_manifest_hash_check",
      sql`${table.manifestHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_marketplace_resource_manifest_size_check",
      sql`${table.manifestByteSize} between 1 and ${CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES_SQL}`
    ),
    check(
      "creator_marketplace_resource_manifest_shape_check",
      sql`(
        jsonb_typeof(${table.manifest}) = 'object'
        and ${table.manifest}->>'schemaVersion' = '1'
        and ${table.manifest}->>'packageId' = ${table.packageId}
        and ${table.manifest}->>'kind' = ${table.kind}
        and ${table.manifest}->>'resourceVersion' = ${table.resourceVersion}
        and ${table.manifest}->>'minimumStudioVersion' = ${table.minimumStudioVersion}
        and ${table.manifest}->>'license' = ${table.license}
        and ${table.manifest}->'provenance'->>'origin' = ${table.provenanceOrigin}
        and jsonb_typeof(${table.manifest}->'entries') = 'array'
        and jsonb_array_length(${table.manifest}->'entries') between 1 and 32
      ) is true`
    ),
  ]
);
