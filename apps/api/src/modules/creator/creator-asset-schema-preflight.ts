import { matchesPostgresCheckDefinition } from "../../common/postgres-check-definition";
import { dbPool } from "../../db";

import type { Pool } from "pg";

export const CREATOR_ASSET_SCHEMA_PREFLIGHT = Symbol("CREATOR_ASSET_SCHEMA_PREFLIGHT");

const REQUIRED_ASSET_COLUMNS = [
  "id",
  "userId",
  "name",
  "description",
  "tags",
  "dataUrl",
  "width",
  "height",
  "kind",
  "mimeType",
  "byteSize",
  "contentHash",
  "previewDataUrl",
  "previewWidth",
  "previewHeight",
  "previewMimeType",
  "previewByteSize",
  "previewContentHash",
  "license",
  "attributionText",
  "containsAi",
  "rightsConfirmedAt",
  "moderationStatus",
  "moderationNote",
  "reportCount",
  "reviewedBy",
  "reviewedAt",
  "hidden",
  "downloads",
  "createdAt",
] as const;

const REQUIRED_REPORT_COLUMNS = [
  "id",
  "assetId",
  "reporterId",
  "reason",
  "details",
  "status",
  "resolutionNote",
  "reviewedBy",
  "reviewedAt",
  "createdAt",
] as const;

const REQUIRED_ASSET_CONSTRAINTS = [
  "creator_asset_license_check",
  "creator_asset_moderation_status_check",
  "creator_asset_mime_type_check",
  "creator_asset_byte_size_check",
  "creator_asset_content_hash_check",
  "creator_asset_dimensions_check",
  "creator_asset_preview_check",
  "creator_asset_tags_check",
  "creator_asset_report_count_check",
  "creator_asset_published_rights_check",
] as const;

const REQUIRED_REPORT_CONSTRAINTS = [
  "creator_asset_report_asset_reporter_unique",
  "creator_asset_report_reason_check",
  "creator_asset_report_status_check",
] as const;

const REQUIRED_ASSET_INDEXES = [
  "creator_asset_created_idx",
  "idx_creator_asset_user",
  "idx_creator_asset_catalog",
  "idx_creator_asset_downloads",
  "creator_asset_owner_hash_unique",
] as const;

const REQUIRED_REPORT_INDEXES = [
  "creator_asset_report_asset_reporter_unique",
  "idx_creator_asset_report_queue",
  "idx_creator_asset_report_reporter",
] as const;
const REQUIRED_INDEX_COUNT =
  REQUIRED_ASSET_INDEXES.length + REQUIRED_REPORT_INDEXES.length;

export const CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS: Readonly<Record<string, string>> = {
  creator_asset_license_check: `CHECK (
    "license" = ANY (ARRAY[
      'toonspectrum-standard'::text, 'cc0-1.0'::text,
      'cc-by-4.0'::text, 'cc-by-nc-4.0'::text
    ]::text[])
  )`,
  creator_asset_moderation_status_check: `CHECK (
    "moderationStatus" = ANY (
      ARRAY['published'::text, 'under_review'::text, 'rejected'::text]::text[]
    )
  )`,
  creator_asset_mime_type_check: `CHECK (
    "mimeType" IS NULL OR "mimeType" = ANY (
      ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]::text[]
    )
  )`,
  creator_asset_byte_size_check: `CHECK (
    "byteSize" IS NULL OR ("byteSize" >= 1 AND "byteSize" <= 2250000)
  )`,
  creator_asset_content_hash_check: `CHECK (
    "contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$'::text
  )`,
  creator_asset_dimensions_check: `CHECK (
    "width" >= 1 AND "width" <= 4096
    AND "height" >= 1 AND "height" <= 4096
    AND "width"::bigint * "height"::bigint <= 16777216
  )`,
  creator_asset_preview_check: `CHECK (
    (
      "previewDataUrl" IS NULL
      AND "previewWidth" IS NULL
      AND "previewHeight" IS NULL
      AND "previewMimeType" IS NULL
      AND "previewByteSize" IS NULL
      AND "previewContentHash" IS NULL
    ) OR (
      "previewDataUrl" IS NOT NULL
      AND "previewWidth" IS NOT NULL
      AND "previewHeight" IS NOT NULL
      AND "previewMimeType" IS NOT NULL
      AND "previewByteSize" IS NOT NULL
      AND "previewContentHash" IS NOT NULL
      AND "previewWidth" >= 1 AND "previewWidth" <= 320
      AND "previewHeight" >= 1 AND "previewHeight" <= 320
      AND "previewMimeType" = ANY (
        ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]::text[]
      )
      AND "previewByteSize" >= 1 AND "previewByteSize" <= 131072
      AND "previewContentHash" ~ '^[0-9a-f]{64}$'::text
    )
  )`,
  creator_asset_tags_check: `CHECK (jsonb_typeof("tags") = 'array'::text)`,
  creator_asset_report_count_check: `CHECK ("reportCount" >= 0)`,
  creator_asset_published_rights_check: `CHECK (
    "moderationStatus" <> 'published'::text OR "rightsConfirmedAt" IS NOT NULL
  )`,
};

export const CREATOR_ASSET_REPORT_CANONICAL_CHECK_DEFINITIONS: Readonly<
  Record<string, string>
> = {
  creator_asset_report_reason_check: `CHECK (
    "reason" = ANY (ARRAY[
      'copyright'::text, 'unsafe'::text, 'spam'::text, 'misleading'::text, 'other'::text
    ]::text[])
  )`,
  creator_asset_report_status_check: `CHECK (
    "status" = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text]::text[])
  )`,
};

const EXPECTED_ASSET_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  description: ["''::text"],
  tags: ["'[]'::jsonb"],
  kind: ["'image'::text"],
  license: ["'toonspectrum-standard'::text"],
  attributionText: ["''::text"],
  containsAi: ["false", "'false'::boolean"],
  moderationStatus: ["'under_review'::text"],
  moderationNote: ["''::text"],
  reportCount: ["0", "0::integer", "'0'::integer"],
  hidden: ["false", "'false'::boolean"],
  downloads: ["0", "0::integer", "'0'::integer"],
};

const EXPECTED_REPORT_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  details: ["''::text"],
  status: ["'open'::text"],
  resolutionNote: ["''::text"],
  createdAt: ["current_timestamp", "now()", "transaction_timestamp()"],
};

interface CreatorAssetSchemaRow {
  assetTable: string | null;
  reportTable: string | null;
  assetColumnCount: number;
  reportColumnCount: number;
  assetConstraintCount: number;
  reportConstraintCount: number;
  assetCheckDefinitions: Record<string, unknown> | null;
  reportCheckDefinitions: Record<string, unknown> | null;
  validIndexCount: number;
  ownerHashUnique: boolean;
  assetDefaults: Record<string, unknown> | null;
  reportDefaults: Record<string, unknown> | null;
  moderationDefault: string | null;
  reportStatusDefault: string | null;
  assetPrimaryKeyReady: boolean;
  reportPrimaryKeyReady: boolean;
  assetOwnerCascadeReady: boolean;
  reportAssetCascadeReady: boolean;
  reportReporterCascadeReady: boolean;
}

type QueryablePool = Pick<Pool, "query">;

const INCOMPLETE_SCHEMA_MESSAGE =
  "Creator Asset schema is incomplete; run drizzle-kit push and apply migration 0013_creator_asset_marketplace.sql before starting the API";

function checkDefinitionsReady(
  actual: Record<string, unknown> | null,
  expected: Readonly<Record<string, string>>
): boolean {
  if (!actual || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([name, canonical]) =>
    matchesPostgresCheckDefinition(actual[name], canonical)
  );
}

function compactDefault(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let compacted = value.trim().toLowerCase().replace(/\s+/gu, "");
  while (compacted.startsWith("(") && compacted.endsWith(")")) {
    compacted = compacted.slice(1, -1);
  }
  return compacted;
}

function defaultsReady(
  actual: Record<string, unknown> | null,
  expected: Readonly<Record<string, readonly string[]>>
): boolean {
  if (!actual || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([name, accepted]) => {
    const normalized = compactDefault(actual[name]);
    return normalized !== null && accepted.some((value) => compactDefault(value) === normalized);
  });
}

/**
 * Validate the durable Creator Asset schema before Nest accepts traffic. Schema mutation belongs
 * to deployment migrations: doing CREATE/ALTER/UPDATE work in an asset request can race cold
 * starts, hold DDL locks, or make a missing migration look like an empty catalog.
 */
export async function preflightCreatorAssetSchema(
  pool: QueryablePool = dbPool
): Promise<void> {
  const schema = await pool.query<CreatorAssetSchemaRow>(
    `SELECT
       to_regclass('public.creator_asset')::text AS "assetTable",
       to_regclass('public.creator_asset_report')::text AS "reportTable",
       (
         SELECT count(*)::integer
         FROM (VALUES
           ('id', 'text', true),
           ('userId', 'text', true),
           ('name', 'text', true),
           ('description', 'text', true),
           ('tags', 'jsonb', true),
           ('dataUrl', 'text', true),
           ('width', 'integer', true),
           ('height', 'integer', true),
           ('kind', 'text', true),
           ('mimeType', 'text', false),
           ('byteSize', 'integer', false),
           ('contentHash', 'text', false),
           ('previewDataUrl', 'text', false),
           ('previewWidth', 'integer', false),
           ('previewHeight', 'integer', false),
           ('previewMimeType', 'text', false),
           ('previewByteSize', 'integer', false),
           ('previewContentHash', 'text', false),
           ('license', 'text', true),
           ('attributionText', 'text', true),
           ('containsAi', 'boolean', true),
           ('rightsConfirmedAt', 'timestamp with time zone', false),
           ('moderationStatus', 'text', true),
           ('moderationNote', 'text', true),
           ('reportCount', 'integer', true),
           ('reviewedBy', 'text', false),
           ('reviewedAt', 'timestamp with time zone', false),
           ('hidden', 'boolean', true),
           ('downloads', 'integer', true),
           ('createdAt', 'timestamp without time zone', false)
         ) AS expected_column(name, formatted_type, is_not_null)
         WHERE expected_column.name = ANY($1::text[])
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = to_regclass('public.creator_asset')
               AND attribute.attname::text = expected_column.name
               AND attribute.attnum > 0
               AND NOT attribute.attisdropped
               AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) =
                 expected_column.formatted_type
               AND attribute.attnotnull = expected_column.is_not_null
           )
       ) AS "assetColumnCount",
       (
         SELECT count(*)::integer
         FROM (VALUES
           ('id', 'text', true),
           ('assetId', 'text', true),
           ('reporterId', 'text', true),
           ('reason', 'text', true),
           ('details', 'text', true),
           ('status', 'text', true),
           ('resolutionNote', 'text', true),
           ('reviewedBy', 'text', false),
           ('reviewedAt', 'timestamp with time zone', false),
           ('createdAt', 'timestamp with time zone', true)
         ) AS expected_column(name, formatted_type, is_not_null)
         WHERE expected_column.name = ANY($2::text[])
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
               AND attribute.attname::text = expected_column.name
               AND attribute.attnum > 0
               AND NOT attribute.attisdropped
               AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) =
                 expected_column.formatted_type
               AND attribute.attnotnull = expected_column.is_not_null
           )
       ) AS "reportColumnCount",
       (
         SELECT count(*)::integer
         FROM (VALUES
           ('creator_asset_license_check', ARRAY['license']::text[]),
           ('creator_asset_moderation_status_check', ARRAY['moderationStatus']::text[]),
           ('creator_asset_mime_type_check', ARRAY['mimeType']::text[]),
           ('creator_asset_byte_size_check', ARRAY['byteSize']::text[]),
           ('creator_asset_content_hash_check', ARRAY['contentHash']::text[]),
           ('creator_asset_dimensions_check', ARRAY['height', 'width']::text[]),
           (
             'creator_asset_preview_check',
             ARRAY[
               'previewByteSize', 'previewContentHash', 'previewDataUrl',
               'previewHeight', 'previewMimeType', 'previewWidth'
             ]::text[]
           ),
           ('creator_asset_tags_check', ARRAY['tags']::text[]),
           ('creator_asset_report_count_check', ARRAY['reportCount']::text[]),
           (
             'creator_asset_published_rights_check',
             ARRAY['moderationStatus', 'rightsConfirmedAt']::text[]
           )
         ) AS expected_constraint(name, column_names)
         WHERE expected_constraint.name = ANY($3::text[])
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_constraint AS constraint_record
             WHERE constraint_record.conrelid = to_regclass('public.creator_asset')
               AND constraint_record.conname::text = expected_constraint.name
               AND constraint_record.contype = 'c'
               AND constraint_record.convalidated
               AND ARRAY(
                 SELECT attribute.attname::text
                 FROM unnest(constraint_record.conkey) AS key_column(attnum)
                 INNER JOIN pg_catalog.pg_attribute AS attribute
                   ON attribute.attrelid = constraint_record.conrelid
                  AND attribute.attnum = key_column.attnum
                 ORDER BY attribute.attname COLLATE "C"
               ) = expected_constraint.column_names
           )
       ) AS "assetConstraintCount",
       (
         SELECT count(*)::integer
         FROM (VALUES
           (
             'creator_asset_report_asset_reporter_unique',
             'u',
             ARRAY['assetId', 'reporterId']::text[]
           ),
           ('creator_asset_report_reason_check', 'c', ARRAY['reason']::text[]),
           ('creator_asset_report_status_check', 'c', ARRAY['status']::text[])
         ) AS expected_constraint(name, constraint_type, column_names)
         WHERE expected_constraint.name = ANY($4::text[])
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_constraint AS constraint_record
             WHERE constraint_record.conrelid = to_regclass('public.creator_asset_report')
               AND constraint_record.conname::text = expected_constraint.name
               AND constraint_record.contype::text = expected_constraint.constraint_type
               AND constraint_record.convalidated
               AND (
                 expected_constraint.constraint_type <> 'u'
                 OR (
                   NOT constraint_record.condeferrable
                   AND NOT constraint_record.condeferred
                 )
               )
               AND ARRAY(
                 SELECT attribute.attname::text
                 FROM unnest(constraint_record.conkey) WITH ORDINALITY
                   AS key_column(attnum, position)
                 INNER JOIN pg_catalog.pg_attribute AS attribute
                   ON attribute.attrelid = constraint_record.conrelid
                  AND attribute.attnum = key_column.attnum
                 ORDER BY key_column.position
               ) = expected_constraint.column_names
           )
       ) AS "reportConstraintCount",
       COALESCE((
         SELECT jsonb_object_agg(
           constraint_record.conname::text,
           pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
         )
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset')
           AND constraint_record.conname::text = ANY($3::text[])
           AND constraint_record.contype = 'c'
           AND constraint_record.convalidated
       ), '{}'::jsonb) AS "assetCheckDefinitions",
       COALESCE((
         SELECT jsonb_object_agg(
           constraint_record.conname::text,
           pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
         )
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset_report')
           AND constraint_record.conname::text = ANY($4::text[])
           AND constraint_record.contype = 'c'
           AND constraint_record.convalidated
       ), '{}'::jsonb) AS "reportCheckDefinitions",
       (
         SELECT count(*)::integer
         FROM (VALUES
           (
             'public.creator_asset', 'creator_asset_created_idx',
             ARRAY['createdAt']::text[], ARRAY[0]::smallint[], false, NULL::text
           ),
           (
             'public.creator_asset', 'idx_creator_asset_user',
             ARRAY['userId']::text[], ARRAY[0]::smallint[], false, NULL::text
           ),
           (
             'public.creator_asset', 'idx_creator_asset_catalog',
             ARRAY['moderationStatus', 'hidden', 'createdAt']::text[],
             ARRAY[0, 0, 3]::smallint[], false, NULL::text
           ),
           (
             'public.creator_asset', 'idx_creator_asset_downloads',
             ARRAY['downloads', 'createdAt']::text[], ARRAY[3, 3]::smallint[],
             false, NULL::text
           ),
           (
             'public.creator_asset', 'creator_asset_owner_hash_unique',
             ARRAY['userId', 'contentHash']::text[], ARRAY[0, 0]::smallint[],
             true, 'contenthashisnotnull'
           ),
           (
             'public.creator_asset_report', 'creator_asset_report_asset_reporter_unique',
             ARRAY['assetId', 'reporterId']::text[], ARRAY[0, 0]::smallint[],
             true, NULL::text
           ),
           (
             'public.creator_asset_report', 'idx_creator_asset_report_queue',
             ARRAY['status', 'createdAt']::text[], ARRAY[0, 0]::smallint[],
             false, NULL::text
           ),
           (
             'public.creator_asset_report', 'idx_creator_asset_report_reporter',
             ARRAY['reporterId', 'createdAt']::text[], ARRAY[0, 3]::smallint[],
             false, NULL::text
           )
         ) AS expected_index(
           table_name, name, column_names, sort_options, is_unique, predicate_marker
         )
         WHERE (
             expected_index.name = ANY($5::text[])
             OR expected_index.name = ANY($6::text[])
           )
           AND EXISTS (
             SELECT 1
             FROM pg_catalog.pg_class AS index_class
             INNER JOIN pg_catalog.pg_index AS index_record
               ON index_record.indexrelid = index_class.oid
             INNER JOIN pg_catalog.pg_class AS table_class
               ON table_class.oid = index_record.indrelid
             INNER JOIN pg_catalog.pg_am AS access_method
               ON access_method.oid = index_class.relam
             WHERE index_class.relnamespace = 'public'::regnamespace
               AND index_class.relname::text = expected_index.name
               AND index_record.indrelid = to_regclass(expected_index.table_name)
               AND table_class.relnamespace = 'public'::regnamespace
               AND access_method.amname = 'btree'
               AND index_record.indisvalid
               AND index_record.indisready
               AND NOT index_record.indisexclusion
               AND NOT index_record.indnullsnotdistinct
               AND index_record.indisunique = expected_index.is_unique
               AND index_record.indexprs IS NULL
               AND index_record.indnkeyatts = cardinality(expected_index.column_names)
               AND index_record.indnatts = cardinality(expected_index.column_names)
               AND ARRAY(
                 SELECT attribute.attname::text
                 FROM unnest(index_record.indkey::smallint[]) WITH ORDINALITY
                   AS key_column(attnum, position)
                 INNER JOIN pg_catalog.pg_attribute AS attribute
                   ON attribute.attrelid = index_record.indrelid
                  AND attribute.attnum = key_column.attnum
                 WHERE key_column.position <= index_record.indnkeyatts
                 ORDER BY key_column.position
               ) = expected_index.column_names
               AND ARRAY(
                 SELECT sort_option
                 FROM unnest(index_record.indoption::smallint[]) WITH ORDINALITY
                   AS index_option(sort_option, position)
                 WHERE index_option.position <= index_record.indnkeyatts
                 ORDER BY index_option.position
               ) = expected_index.sort_options
               AND (
                 (
                   expected_index.predicate_marker IS NULL
                   AND index_record.indpred IS NULL
                 )
                 OR (
                   expected_index.predicate_marker IS NOT NULL
                   AND lower(regexp_replace(
                     pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid),
                     '[^a-zA-Z0-9]+',
                     '',
                     'g'
                   )) = expected_index.predicate_marker
                 )
               )
           )
       ) AS "validIndexCount",
       COALESCE((
         SELECT index_record.indisunique
           AND index_record.indisvalid
           AND index_record.indisready
         FROM pg_catalog.pg_index AS index_record
         WHERE index_record.indexrelid =
           to_regclass('public.creator_asset_owner_hash_unique')
           AND index_record.indrelid = to_regclass('public.creator_asset')
           AND lower(regexp_replace(
             pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid),
             '[^a-zA-Z0-9]+',
             '',
             'g'
           )) = 'contenthashisnotnull'
       ), false) AS "ownerHashUnique",
       COALESCE((
         SELECT jsonb_object_agg(
           attribute.attname::text,
           pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
         )
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_attrdef AS default_record
           ON default_record.adrelid = attribute.attrelid
          AND default_record.adnum = attribute.attnum
         WHERE attribute.attrelid = to_regclass('public.creator_asset')
           AND attribute.attname = ANY (ARRAY[
             'description', 'tags', 'kind', 'license', 'attributionText', 'containsAi',
             'moderationStatus', 'moderationNote', 'reportCount', 'hidden', 'downloads'
           ])
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ), '{}'::jsonb) AS "assetDefaults",
       COALESCE((
         SELECT jsonb_object_agg(
           attribute.attname::text,
           pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
         )
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_attrdef AS default_record
           ON default_record.adrelid = attribute.attrelid
          AND default_record.adnum = attribute.attnum
         WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
           AND attribute.attname = ANY (ARRAY[
             'details', 'status', 'resolutionNote', 'createdAt'
           ])
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ), '{}'::jsonb) AS "reportDefaults",
       (
         SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
         FROM pg_catalog.pg_attribute AS attribute
         LEFT JOIN pg_catalog.pg_attrdef AS default_record
           ON default_record.adrelid = attribute.attrelid
          AND default_record.adnum = attribute.attnum
         WHERE attribute.attrelid = to_regclass('public.creator_asset')
           AND attribute.attname = 'moderationStatus'
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ) AS "moderationDefault",
       (
         SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
         FROM pg_catalog.pg_attribute AS attribute
         LEFT JOIN pg_catalog.pg_attrdef AS default_record
           ON default_record.adrelid = attribute.attrelid
          AND default_record.adnum = attribute.attnum
         WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
           AND attribute.attname = 'status'
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ) AS "reportStatusDefault",
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset')
           AND constraint_record.contype = 'p'
           AND constraint_record.conkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset')
                 AND attribute.attname = 'id'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.convalidated
       ) AS "assetPrimaryKeyReady",
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset_report')
           AND constraint_record.contype = 'p'
           AND constraint_record.conkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
                 AND attribute.attname = 'id'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.convalidated
       ) AS "reportPrimaryKeyReady",
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset')
           AND constraint_record.contype = 'f'
           AND constraint_record.confrelid = to_regclass('public."user"')
           AND constraint_record.confdeltype = 'c'
           AND constraint_record.conkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset')
                 AND attribute.attname = 'userId'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.confkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public."user"')
                 AND attribute.attname = 'id'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.convalidated
       ) AS "assetOwnerCascadeReady",
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset_report')
           AND constraint_record.contype = 'f'
           AND constraint_record.confrelid = to_regclass('public.creator_asset')
           AND constraint_record.confdeltype = 'c'
           AND constraint_record.conkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
                 AND attribute.attname = 'assetId'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.confkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset')
                 AND attribute.attname = 'id'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.convalidated
       ) AS "reportAssetCascadeReady",
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid = to_regclass('public.creator_asset_report')
           AND constraint_record.contype = 'f'
           AND constraint_record.confrelid = to_regclass('public."user"')
           AND constraint_record.confdeltype = 'c'
           AND constraint_record.conkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public.creator_asset_report')
                 AND attribute.attname = 'reporterId'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.confkey = ARRAY[
             (
               SELECT attribute.attnum
               FROM pg_catalog.pg_attribute AS attribute
               WHERE attribute.attrelid = to_regclass('public."user"')
                 AND attribute.attname = 'id'
                 AND NOT attribute.attisdropped
             )
           ]::smallint[]
           AND constraint_record.convalidated
       ) AS "reportReporterCascadeReady"`,
    [
      [...REQUIRED_ASSET_COLUMNS],
      [...REQUIRED_REPORT_COLUMNS],
      [...REQUIRED_ASSET_CONSTRAINTS],
      [...REQUIRED_REPORT_CONSTRAINTS],
      [...REQUIRED_ASSET_INDEXES],
      [...REQUIRED_REPORT_INDEXES],
    ]
  );
  const state = schema.rows[0];
  if (
    !state?.assetTable ||
    !state.reportTable ||
    state.assetColumnCount !== REQUIRED_ASSET_COLUMNS.length ||
    state.reportColumnCount !== REQUIRED_REPORT_COLUMNS.length ||
    state.assetConstraintCount !== REQUIRED_ASSET_CONSTRAINTS.length ||
    state.reportConstraintCount !== REQUIRED_REPORT_CONSTRAINTS.length ||
    !checkDefinitionsReady(
      state.assetCheckDefinitions,
      CREATOR_ASSET_CANONICAL_CHECK_DEFINITIONS
    ) ||
    !checkDefinitionsReady(
      state.reportCheckDefinitions,
      CREATOR_ASSET_REPORT_CANONICAL_CHECK_DEFINITIONS
    ) ||
    state.validIndexCount !== REQUIRED_INDEX_COUNT ||
    state.ownerHashUnique !== true ||
    !defaultsReady(state.assetDefaults, EXPECTED_ASSET_DEFAULTS) ||
    !defaultsReady(state.reportDefaults, EXPECTED_REPORT_DEFAULTS) ||
    state.moderationDefault !== "'under_review'::text" ||
    state.reportStatusDefault !== "'open'::text" ||
    state.assetPrimaryKeyReady !== true ||
    state.reportPrimaryKeyReady !== true ||
    state.assetOwnerCascadeReady !== true ||
    state.reportAssetCascadeReady !== true ||
    state.reportReporterCascadeReady !== true
  ) {
    throw new Error(INCOMPLETE_SCHEMA_MESSAGE);
  }

  const legacyRows = await pool.query<{ unsafe: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM public.creator_asset
      WHERE "moderationStatus" = 'published'
        AND "rightsConfirmedAt" IS NULL
    ) AS "unsafe"
  `);
  if (legacyRows.rows[0]?.unsafe !== false) {
    throw new Error(
      "Creator Asset rights quarantine is incomplete; apply migration 0013_creator_asset_marketplace.sql before starting the API"
    );
  }
}

export const creatorAssetSchemaPreflightProvider = {
  provide: CREATOR_ASSET_SCHEMA_PREFLIGHT,
  useFactory: async (): Promise<true> => {
    await preflightCreatorAssetSchema();
    return true;
  },
};
