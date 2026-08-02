import { dbPool } from "../../../../../lib/db";

import type { Pool, QueryConfig } from "pg";

export const HEALTH_READINESS_REPOSITORY = Symbol(
  "HEALTH_READINESS_REPOSITORY",
);

export const HEALTH_READINESS_QUERY_TIMEOUT_MS = 3_000;

/**
 * Every persistent relation declared by the current Drizzle model.
 *
 * Readiness deliberately checks the complete product schema rather than a small "core" subset:
 * a host must not be admitted while login works but Studio, collaboration, comments, AI quotas,
 * marketplace, or another user-visible feature has silently disappeared.
 */
export const REQUIRED_DATABASE_RELATIONS = [
  "account",
  "app_setting",
  "catalog_ingest_run",
  "catalog_snapshot",
  "collection",
  "collection_item",
  "community_cafe",
  "community_cafe_member",
  "creator_asset",
  "creator_asset_report",
  "creator_asset_storage_object",
  "creator_campaign",
  "creator_challenge",
  "creator_draft_collaboration_room",
  "creator_follow",
  "creator_marketplace_publish_gate",
  "creator_marketplace_resource",
  "creator_profile",
  "creator_series",
  "creator_work",
  "creator_work_asset",
  "creator_work_asset_storage_reference",
  "creator_work_asset_tombstone",
  "creator_work_collaboration_event",
  "creator_work_collaborator",
  "creator_work_comment",
  "creator_work_crdt_node_load",
  "creator_work_crdt_raster_checkpoint_job",
  "creator_work_crdt_snapshot",
  "creator_work_crdt_update",
  "creator_work_crdt_update_receipt",
  "creator_work_like",
  "creator_work_live_lock",
  "creator_work_live_lock_clock",
  "creator_work_raster_asset",
  "creator_work_revision",
  "creator_work_team_comment_activity",
  "creator_work_team_comment_message",
  "creator_work_team_comment_mutation",
  "creator_work_team_comment_read",
  "creator_work_team_comment_thread",
  "fan_post",
  "fan_post_reply",
  "feedback_post",
  "feedback_reply",
  "monetization_plan",
  "rating",
  "read",
  "revenue_ledger",
  "review",
  "review_like",
  "review_reply",
  "session",
  "socket_io_attachments",
  "studio_ai_daily_quota",
  "studio_ai_global_daily_quota",
  "studio_ai_request_gate",
  "studio_ai_request_receipt",
  "studio_ai_usage_ledger",
  "subscription",
  "toonspectrum_schema_migration",
  "user",
  "verificationToken",
] as const;

/**
 * Only cutovers that cannot be proven by a final-looking Drizzle schema use the durable ledger.
 * Migrations 0018+ are represented by required relations/capabilities below.
 */
export const REQUIRED_DATABASE_MIGRATIONS = [
  "0017_creator_work_live_lock_revision",
] as const;

interface DatabasePingRow {
  ready: number;
}

interface SchemaCatalogRow {
  relationNames: string[] | null;
  marketplaceSearchGenerated: boolean;
  marketplaceSearchIndexReady: boolean;
  marketplaceTagIndexReady: boolean;
  commentActivityReanchorReady: boolean;
  commentMutationReanchorReady: boolean;
  commentMutationMessageNullable: boolean;
  trigramExtensionReady: boolean;
}

interface MigrationCatalogRow {
  migrationIds: string[] | null;
}

type QueryablePool = Pick<Pool, "query">;
type TimedHealthQuery = QueryConfig & { query_timeout: number };

function timedHealthQuery(
  text: string,
  values?: unknown[],
): TimedHealthQuery {
  return {
    text,
    values: values as QueryConfig["values"],
    query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
  };
}

function containsEvery(
  actual: readonly string[] | null,
  required: readonly string[],
): boolean {
  if (!actual) return false;
  const actualSet = new Set(actual);
  return (
    actualSet.size === required.length &&
    required.every((value) => actualSet.has(value))
  );
}

export interface HealthReadinessRepository {
  isDatabaseReachable(): Promise<boolean>;
  isSchemaReady(): Promise<boolean>;
}

export class PostgresHealthReadinessRepository
  implements HealthReadinessRepository
{
  constructor(private readonly pool: QueryablePool = dbPool) {}

  async isDatabaseReachable(): Promise<boolean> {
    const result = await this.pool.query<DatabasePingRow>(
      timedHealthQuery(`SELECT 1::integer AS "ready"`),
    );
    return result.rows[0]?.ready === 1;
  }

  async isSchemaReady(): Promise<boolean> {
    const catalog = await this.pool.query<SchemaCatalogRow>(
      timedHealthQuery(
        `
          SELECT
            COALESCE(
              array_agg(
                relation.relname::text
                ORDER BY relation.relname::text
              )
                FILTER (WHERE relation.relname IS NOT NULL),
              ARRAY[]::text[]
            ) AS "relationNames",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid =
                to_regclass('public.creator_marketplace_resource')
                AND attribute.attname = 'searchText'
                AND attribute.attgenerated = 's'
                AND attribute.attnum > 0
                AND NOT attribute.attisdropped
            ) AS "marketplaceSearchGenerated",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_class AS index_record
              JOIN pg_catalog.pg_namespace AS index_namespace
                ON index_namespace.oid = index_record.relnamespace
              JOIN pg_catalog.pg_index AS index_state
                ON index_state.indexrelid = index_record.oid
              JOIN pg_catalog.pg_class AS indexed_table
                ON indexed_table.oid = index_state.indrelid
              JOIN pg_catalog.pg_namespace AS table_namespace
                ON table_namespace.oid = indexed_table.relnamespace
              JOIN pg_catalog.pg_am AS index_method
                ON index_method.oid = index_record.relam
              JOIN pg_catalog.pg_attribute AS indexed_attribute
                ON indexed_attribute.attrelid = indexed_table.oid
                AND indexed_attribute.attnum = index_state.indkey[0]
              JOIN pg_catalog.pg_opclass AS operator_class
                ON operator_class.oid = index_state.indclass[0]
              WHERE index_record.relname =
                'idx_creator_marketplace_resource_search'
                AND index_record.relkind = 'i'
                AND index_namespace.nspname = 'public'
                AND indexed_table.relname =
                  'creator_marketplace_resource'
                AND table_namespace.nspname = 'public'
                AND index_state.indrelid =
                  to_regclass('public.creator_marketplace_resource')
                AND index_state.indisvalid
                AND index_state.indisready
                AND index_state.indislive
                AND NOT index_state.indisunique
                AND NOT index_state.indisprimary
                AND NOT index_state.indisexclusion
                AND index_state.indnkeyatts = 1
                AND index_state.indnatts = 1
                AND index_state.indexprs IS NULL
                AND index_method.amname = 'gin'
                AND operator_class.opcmethod = index_method.oid
                AND operator_class.opcname = 'gin_trgm_ops'
                AND indexed_attribute.attname = 'searchText'
                AND indexed_attribute.atttypid = 'text'::regtype
                AND pg_catalog.pg_get_expr(
                  index_state.indpred,
                  index_state.indrelid,
                  true
                ) = 'hidden = false'
                AND EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_depend AS extension_dependency
                  JOIN pg_catalog.pg_extension AS owning_extension
                    ON owning_extension.oid =
                      extension_dependency.refobjid
                  WHERE extension_dependency.classid =
                    'pg_catalog.pg_opclass'::regclass
                    AND extension_dependency.objid =
                      operator_class.oid
                    AND extension_dependency.refclassid =
                      'pg_catalog.pg_extension'::regclass
                    AND extension_dependency.deptype = 'e'
                    AND owning_extension.extname = 'pg_trgm'
                )
            ) AS "marketplaceSearchIndexReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_class AS index_record
              JOIN pg_catalog.pg_namespace AS index_namespace
                ON index_namespace.oid = index_record.relnamespace
              JOIN pg_catalog.pg_index AS index_state
                ON index_state.indexrelid = index_record.oid
              JOIN pg_catalog.pg_class AS indexed_table
                ON indexed_table.oid = index_state.indrelid
              JOIN pg_catalog.pg_namespace AS table_namespace
                ON table_namespace.oid = indexed_table.relnamespace
              JOIN pg_catalog.pg_am AS index_method
                ON index_method.oid = index_record.relam
              JOIN pg_catalog.pg_attribute AS indexed_attribute
                ON indexed_attribute.attrelid = indexed_table.oid
                AND indexed_attribute.attnum = index_state.indkey[0]
              JOIN pg_catalog.pg_opclass AS operator_class
                ON operator_class.oid = index_state.indclass[0]
              JOIN pg_catalog.pg_namespace AS operator_namespace
                ON operator_namespace.oid =
                  operator_class.opcnamespace
              WHERE index_record.relname =
                'idx_creator_marketplace_resource_tags'
                AND index_record.relkind = 'i'
                AND index_namespace.nspname = 'public'
                AND indexed_table.relname =
                  'creator_marketplace_resource'
                AND table_namespace.nspname = 'public'
                AND index_state.indrelid =
                  to_regclass('public.creator_marketplace_resource')
                AND index_state.indisvalid
                AND index_state.indisready
                AND index_state.indislive
                AND NOT index_state.indisunique
                AND NOT index_state.indisprimary
                AND NOT index_state.indisexclusion
                AND index_state.indnkeyatts = 1
                AND index_state.indnatts = 1
                AND index_state.indexprs IS NULL
                AND index_method.amname = 'gin'
                AND operator_class.opcmethod = index_method.oid
                AND operator_class.opcname = 'jsonb_path_ops'
                AND operator_namespace.nspname = 'pg_catalog'
                AND indexed_attribute.attname = 'tags'
                AND indexed_attribute.atttypid = 'jsonb'::regtype
                AND pg_catalog.pg_get_expr(
                  index_state.indpred,
                  index_state.indrelid,
                  true
                ) = 'hidden = false'
            ) AS "marketplaceTagIndexReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_constraint AS constraint_record
              WHERE constraint_record.conrelid =
                to_regclass('public.creator_work_team_comment_activity')
                AND constraint_record.conname =
                  'creator_work_team_comment_activity_action_check'
                AND pg_catalog.pg_get_constraintdef(
                  constraint_record.oid,
                  true
                ) LIKE '%reanchored%'
            ) AS "commentActivityReanchorReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_constraint AS constraint_record
              WHERE constraint_record.conrelid =
                to_regclass('public.creator_work_team_comment_mutation')
                AND constraint_record.conname =
                  'creator_work_team_comment_mutation_operation_check'
                AND pg_catalog.pg_get_constraintdef(
                  constraint_record.oid,
                  true
                ) LIKE '%thread_reanchor%'
            ) AS "commentMutationReanchorReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid =
                to_regclass('public.creator_work_team_comment_mutation')
                AND attribute.attname = 'messageId'
                AND attribute.attnotnull = false
                AND attribute.attnum > 0
                AND NOT attribute.attisdropped
            ) AS "commentMutationMessageNullable",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_extension
              WHERE extname = 'pg_trgm'
            ) AS "trigramExtensionReady"
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p')
            AND relation.relname = ANY($1::text[])
        `,
        [[...REQUIRED_DATABASE_RELATIONS]],
      ),
    );
    const state = catalog.rows[0];
    if (
      !state ||
      !containsEvery(state.relationNames, REQUIRED_DATABASE_RELATIONS) ||
      state.marketplaceSearchGenerated !== true ||
      state.marketplaceSearchIndexReady !== true ||
      state.marketplaceTagIndexReady !== true ||
      state.commentActivityReanchorReady !== true ||
      state.commentMutationReanchorReady !== true ||
      state.commentMutationMessageNullable !== true ||
      state.trigramExtensionReady !== true
    ) {
      return false;
    }

    const migrations = await this.pool.query<MigrationCatalogRow>(
      timedHealthQuery(
        `
          SELECT COALESCE(
            array_agg("id" ORDER BY "id"),
            ARRAY[]::text[]
          ) AS "migrationIds"
          FROM public.toonspectrum_schema_migration
          WHERE "id" = ANY($1::text[])
        `,
        [[...REQUIRED_DATABASE_MIGRATIONS]],
      ),
    );
    return containsEvery(
      migrations.rows[0]?.migrationIds ?? null,
      REQUIRED_DATABASE_MIGRATIONS,
    );
  }
}

export const healthReadinessRepositoryProvider = {
  provide: HEALTH_READINESS_REPOSITORY,
  useFactory: (): HealthReadinessRepository =>
    new PostgresHealthReadinessRepository(),
};
