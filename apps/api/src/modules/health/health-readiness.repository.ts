import { dbPool } from "../../db";

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
 * Secondary-index migrations such as 0029 remain outside runtime readiness during the expand
 * release; the strict production capability verifier owns that post-migration contract.
 */
export const REQUIRED_DATABASE_MIGRATIONS = [
  "0017_creator_work_live_lock_revision",
  "0025_auth_lifecycle_contract",
  "0026_creator_draft_cloud_save_intent",
  "0027_creator_draft_atomic_publication",
] as const;

interface DatabasePingRow {
  ready: number;
}

interface SchemaCatalogRow {
  relationNames: string[] | null;
  authUserColumnsReady: boolean;
  authUserConstraintsReady: boolean;
  authUserStatusIndexReady: boolean;
  authAccountColumnsReady: boolean;
  authAccountConstraintsReady: boolean;
  authAccountUserIndexReady: boolean;
  authRuntimeDmlReady: boolean;
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
            NOT EXISTS (
              SELECT 1
              FROM (VALUES
                ('id', 'text', true),
                ('name', 'text', false),
                ('email', 'text', false),
                ('emailVerified', 'timestamp without time zone', false),
                ('image', 'text', false),
                ('role', 'text', true),
                ('status', 'text', true),
                ('sessionVersion', 'integer', true),
                ('suspendedAt', 'timestamp without time zone', false),
                ('suspensionReason', 'text', false),
                ('deletedAt', 'timestamp without time zone', false),
                ('passwordHash', 'text', false),
                ('avatar', 'text', false),
                ('bio', 'text', false),
                ('createdAt', 'timestamp without time zone', false)
              ) AS expected_column("name", "type", "notNull")
              WHERE NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attribute
                WHERE attribute.attrelid = to_regclass('public."user"')
                  AND attribute.attname = expected_column."name"
                  AND pg_catalog.format_type(
                    attribute.atttypid,
                    attribute.atttypmod
                  ) = expected_column."type"
                  AND attribute.attnotnull = expected_column."notNull"
                  AND attribute.attnum > 0
                  AND NOT attribute.attisdropped
              )
            )
              AND EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attribute
                JOIN pg_catalog.pg_attrdef AS default_record
                  ON default_record.adrelid = attribute.attrelid
                  AND default_record.adnum = attribute.attnum
                WHERE attribute.attrelid = to_regclass('public."user"')
                  AND attribute.attname = 'role'
                  AND pg_catalog.pg_get_expr(
                    default_record.adbin,
                    default_record.adrelid
                  ) = '''user''::text'
              )
              AND EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attribute
                JOIN pg_catalog.pg_attrdef AS default_record
                  ON default_record.adrelid = attribute.attrelid
                  AND default_record.adnum = attribute.attnum
                WHERE attribute.attrelid = to_regclass('public."user"')
                  AND attribute.attname = 'status'
                  AND pg_catalog.pg_get_expr(
                    default_record.adbin,
                    default_record.adrelid
                  ) = '''active''::text'
              )
              AND EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attribute
                JOIN pg_catalog.pg_attrdef AS default_record
                  ON default_record.adrelid = attribute.attrelid
                  AND default_record.adnum = attribute.attnum
                WHERE attribute.attrelid = to_regclass('public."user"')
                  AND attribute.attname = 'sessionVersion'
                  AND pg_catalog.pg_get_expr(
                    default_record.adbin,
                    default_record.adrelid
                  ) = '1'
              ) AS "authUserColumnsReady",
            (
              SELECT count(*) = 4
              FROM pg_catalog.pg_constraint AS constraint_record
              WHERE constraint_record.conrelid = to_regclass('public."user"')
                AND constraint_record.convalidated
                AND (
                  (
                    constraint_record.contype = 'p'
                    AND pg_catalog.pg_get_constraintdef(
                      constraint_record.oid,
                      true
                    ) = 'PRIMARY KEY (id)'
                  )
                  OR (
                    constraint_record.contype = 'u'
                    AND pg_catalog.pg_get_constraintdef(
                      constraint_record.oid,
                      true
                    ) = 'UNIQUE (email)'
                  )
                  OR (
                    constraint_record.contype = 'c'
                    AND constraint_record.conname = 'user_status_check'
                  )
                  OR (
                    constraint_record.contype = 'c'
                    AND constraint_record.conname = 'user_session_version_check'
                  )
                )
            ) AS "authUserConstraintsReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_class AS index_record
              JOIN pg_catalog.pg_namespace AS index_namespace
                ON index_namespace.oid = index_record.relnamespace
              JOIN pg_catalog.pg_index AS index_state
                ON index_state.indexrelid = index_record.oid
              JOIN pg_catalog.pg_attribute AS status_attribute
                ON status_attribute.attrelid = index_state.indrelid
                AND status_attribute.attnum = index_state.indkey[0]
              JOIN pg_catalog.pg_attribute AS created_attribute
                ON created_attribute.attrelid = index_state.indrelid
                AND created_attribute.attnum = index_state.indkey[1]
              WHERE index_namespace.nspname = 'public'
                AND index_record.relname = 'idx_user_status_created'
                AND index_record.relkind = 'i'
                AND index_state.indrelid = to_regclass('public."user"')
                AND index_state.indisvalid
                AND index_state.indisready
                AND index_state.indislive
                AND NOT index_state.indisunique
                AND NOT index_state.indisprimary
                AND NOT index_state.indisexclusion
                AND index_state.indnkeyatts = 2
                AND index_state.indnatts = 2
                AND index_state.indexprs IS NULL
                AND index_state.indpred IS NULL
                AND status_attribute.attname = 'status'
                AND created_attribute.attname = 'createdAt'
            ) AS "authUserStatusIndexReady",
            NOT EXISTS (
              SELECT 1
              FROM (VALUES
                ('userId', 'text', true),
                ('type', 'text', true),
                ('provider', 'text', true),
                ('providerAccountId', 'text', true),
                ('refresh_token', 'text', false),
                ('access_token', 'text', false),
                ('expires_at', 'integer', false),
                ('token_type', 'text', false),
                ('scope', 'text', false),
                ('id_token', 'text', false),
                ('session_state', 'text', false)
              ) AS expected_column("name", "type", "notNull")
              WHERE NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attribute
                WHERE attribute.attrelid = to_regclass('public.account')
                  AND attribute.attname = expected_column."name"
                  AND pg_catalog.format_type(
                    attribute.atttypid,
                    attribute.atttypmod
                  ) = expected_column."type"
                  AND attribute.attnotnull = expected_column."notNull"
                  AND attribute.attnum > 0
                  AND NOT attribute.attisdropped
              )
            ) AS "authAccountColumnsReady",
            (
              SELECT count(*) = 2
              FROM pg_catalog.pg_constraint AS constraint_record
              WHERE constraint_record.conrelid = to_regclass('public.account')
                AND constraint_record.convalidated
                AND (
                  (
                    constraint_record.contype = 'p'
                    AND pg_catalog.pg_get_constraintdef(
                      constraint_record.oid,
                      true
                    ) = 'PRIMARY KEY (provider, "providerAccountId")'
                  )
                  OR (
                    constraint_record.contype = 'f'
                    AND constraint_record.confrelid = to_regclass('public."user"')
                    AND constraint_record.confdeltype = 'c'
                    AND pg_catalog.pg_get_constraintdef(
                      constraint_record.oid,
                      true
                    ) = 'FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE'
                  )
                )
            ) AS "authAccountConstraintsReady",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_class AS index_record
              JOIN pg_catalog.pg_namespace AS index_namespace
                ON index_namespace.oid = index_record.relnamespace
              JOIN pg_catalog.pg_index AS index_state
                ON index_state.indexrelid = index_record.oid
              JOIN pg_catalog.pg_attribute AS user_attribute
                ON user_attribute.attrelid = index_state.indrelid
                AND user_attribute.attnum = index_state.indkey[0]
              WHERE index_namespace.nspname = 'public'
                AND index_record.relname = 'idx_account_user'
                AND index_record.relkind = 'i'
                AND index_state.indrelid = to_regclass('public.account')
                AND index_state.indisvalid
                AND index_state.indisready
                AND index_state.indislive
                AND NOT index_state.indisunique
                AND NOT index_state.indisprimary
                AND NOT index_state.indisexclusion
                AND index_state.indnkeyatts = 1
                AND index_state.indnatts = 1
                AND index_state.indexprs IS NULL
                AND index_state.indpred IS NULL
                AND user_attribute.attname = 'userId'
            ) AS "authAccountUserIndexReady",
            pg_catalog.has_table_privilege(
              current_user,
              'public."user"',
              'SELECT, INSERT, UPDATE, DELETE'
            )
              AND pg_catalog.has_table_privilege(
                current_user,
                'public.account',
                'SELECT, INSERT, UPDATE, DELETE'
              ) AS "authRuntimeDmlReady",
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
      state.authUserColumnsReady !== true ||
      state.authUserConstraintsReady !== true ||
      state.authUserStatusIndexReady !== true ||
      state.authAccountColumnsReady !== true ||
      state.authAccountConstraintsReady !== true ||
      state.authAccountUserIndexReady !== true ||
      state.authRuntimeDmlReady !== true ||
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
