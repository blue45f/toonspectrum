import { runSchemaPreflightToleratingDbUnavailability } from "../../common/database-availability";
import { matchesPostgresCheckDefinition } from "../../common/postgres-check-definition";
import { dbPool } from "../../db";

import type { Pool } from "pg";

export const STUDIO_AI_IDEMPOTENCY_SCHEMA_PREFLIGHT = Symbol(
  "STUDIO_AI_IDEMPOTENCY_SCHEMA_PREFLIGHT"
);

const REQUIRED_COLUMNS = [
  "userKeyHash",
  "userId",
  "requestHash",
  "leaseFence",
  "status",
  "attemptCount",
  "expiresAt",
  "createdAt",
  "updatedAt",
] as const;

export const STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS: Readonly<
  Record<string, string>
> = {
  studio_ai_request_receipt_user_key_hash_check:
    `CHECK (octet_length("userKeyHash") = 32)`,
  studio_ai_request_receipt_request_hash_check:
    `CHECK (octet_length("requestHash") = 32)`,
  studio_ai_request_receipt_lease_fence_check:
    `CHECK ("leaseFence" >= 0)`,
  studio_ai_request_receipt_status_check:
    `CHECK ("status" = ANY (ARRAY['admitted'::text, 'sent'::text, 'succeeded'::text, 'ambiguous'::text]::text[]))`,
  studio_ai_request_receipt_attempt_count_check:
    `CHECK ("attemptCount" >= 0 AND "attemptCount" <= 2)`,
  studio_ai_request_receipt_expiry_check:
    `CHECK ("expiresAt" > "createdAt")`,
};

interface ReceiptSchemaRow {
  receiptTable: string | null;
  tableColumnCount: number;
  requiredColumnCount: number;
  checkDefinitions: Record<string, unknown> | null;
  primaryKeyReady: boolean;
  userCascadeReady: boolean;
  userRequestUniqueReady: boolean;
  expiryIndexReady: boolean;
  attemptDefault: string | null;
  createdDefault: string | null;
  updatedDefault: string | null;
}

type QueryablePool = Pick<Pool, "query">;

const INCOMPLETE_SCHEMA_MESSAGE =
  "Studio AI idempotency schema is incomplete; apply migration 0019_studio_ai_request_receipt.sql before starting the API";

function compactDefault(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let compacted = value.trim().toLowerCase().replace(/\s+/gu, "");
  while (compacted.startsWith("(") && compacted.endsWith(")")) {
    compacted = compacted.slice(1, -1);
  }
  return compacted;
}

function timestampDefaultReady(value: unknown): boolean {
  const normalized = compactDefault(value);
  return normalized === "current_timestamp"
    || normalized === "now()"
    || normalized === "transaction_timestamp()";
}

function checkDefinitionsReady(actual: Record<string, unknown> | null): boolean {
  if (
    !actual
    || Object.keys(actual).length !== Object.keys(
      STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS
    ).length
  ) return false;
  return Object.entries(STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS).every(
    ([name, canonical]) => matchesPostgresCheckDefinition(actual[name], canonical)
  );
}

/** Fail closed before Nest accepts traffic; request paths never create or alter this table. */
export async function preflightStudioAiIdempotencySchema(
  pool: QueryablePool = dbPool
): Promise<void> {
  const schema = await pool.query<ReceiptSchemaRow>(`
    SELECT
      to_regclass('public.studio_ai_request_receipt')::text AS "receiptTable",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS "tableColumnCount",
      (
        SELECT count(*)::integer
        FROM (VALUES
          ('userKeyHash', 'bytea', true),
          ('userId', 'text', true),
          ('requestHash', 'bytea', true),
          ('leaseFence', 'bigint', true),
          ('status', 'text', true),
          ('attemptCount', 'integer', true),
          ('expiresAt', 'timestamp with time zone', true),
          ('createdAt', 'timestamp with time zone', true),
          ('updatedAt', 'timestamp with time zone', true)
        ) AS expected(name, formatted_type, is_not_null)
        WHERE EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
            AND attribute.attname::text = expected.name
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
            AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) =
              expected.formatted_type
            AND attribute.attnotnull = expected.is_not_null
        )
      ) AS "requiredColumnCount",
      COALESCE((
        SELECT jsonb_object_agg(
          constraint_record.conname::text,
          pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        )
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_receipt')
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
          AND constraint_record.conname = ANY (ARRAY[
            'studio_ai_request_receipt_user_key_hash_check',
            'studio_ai_request_receipt_request_hash_check',
            'studio_ai_request_receipt_lease_fence_check',
            'studio_ai_request_receipt_status_check',
            'studio_ai_request_receipt_attempt_count_check',
            'studio_ai_request_receipt_expiry_check'
          ]::text[])
      ), '{}'::jsonb) AS "checkDefinitions",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_receipt')
          AND constraint_record.conname = 'studio_ai_request_receipt_pkey'
          AND constraint_record.contype = 'p'
          AND constraint_record.convalidated
          AND constraint_record.conkey = ARRAY[(
            SELECT attribute.attnum
            FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
              AND attribute.attname = 'userKeyHash'
              AND NOT attribute.attisdropped
          )]::smallint[]
      ) AS "primaryKeyReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_receipt')
          AND constraint_record.conname = 'studio_ai_request_receipt_userId_user_id_fk'
          AND constraint_record.contype = 'f'
          AND constraint_record.confrelid = to_regclass('public."user"')
          AND constraint_record.confdeltype = 'c'
          AND constraint_record.convalidated
          AND constraint_record.conkey = ARRAY[(
            SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
              AND attribute.attname = 'userId' AND NOT attribute.attisdropped
          )]::smallint[]
          AND constraint_record.confkey = ARRAY[(
            SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = to_regclass('public."user"')
              AND attribute.attname = 'id' AND NOT attribute.attisdropped
          )]::smallint[]
      ) AS "userCascadeReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_receipt')
          AND constraint_record.conname = 'studio_ai_request_receipt_user_request_unique'
          AND constraint_record.contype = 'u'
          AND constraint_record.convalidated
          AND constraint_record.conkey = ARRAY[
            (SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
               AND attribute.attname = 'userId' AND NOT attribute.attisdropped),
            (SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
               AND attribute.attname = 'requestHash' AND NOT attribute.attisdropped)
          ]::smallint[]
      ) AS "userRequestUniqueReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS index_class
        INNER JOIN pg_catalog.pg_index AS index_record
          ON index_record.indexrelid = index_class.oid
        INNER JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
        WHERE index_class.relnamespace = 'public'::regnamespace
          AND index_class.relname = 'idx_studio_ai_request_receipt_expires'
          AND index_record.indrelid = to_regclass('public.studio_ai_request_receipt')
          AND access_method.amname = 'btree'
          AND index_record.indisvalid AND index_record.indisready
          AND NOT index_record.indisunique AND NOT index_record.indisexclusion
          AND NOT index_record.indnullsnotdistinct
          AND index_record.indexprs IS NULL AND index_record.indpred IS NULL
          AND index_record.indnkeyatts = 1 AND index_record.indnatts = 1
          -- int2vector casts retain a zero lower bound [0:0], whereas ARRAY[...] starts at
          -- one. Whole-array equality therefore rejects an otherwise exact single-column index.
          -- Cardinality is fixed above, so compare the sole catalog vector slots directly.
          AND index_record.indkey[0] = (
            SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
              AND attribute.attname = 'expiresAt' AND NOT attribute.attisdropped
          )
          AND index_record.indoption[0] = 0
      ) AS "expiryIndexReady",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
          AND attribute.attname = 'attemptCount' AND NOT attribute.attisdropped
      ) AS "attemptDefault",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
          AND attribute.attname = 'createdAt' AND NOT attribute.attisdropped
      ) AS "createdDefault",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_receipt')
          AND attribute.attname = 'updatedAt' AND NOT attribute.attisdropped
      ) AS "updatedDefault"
  `);
  const state = schema.rows[0];
  if (
    !state?.receiptTable
    || state.tableColumnCount !== REQUIRED_COLUMNS.length
    || state.requiredColumnCount !== REQUIRED_COLUMNS.length
    || !checkDefinitionsReady(state.checkDefinitions)
    || state.primaryKeyReady !== true
    || state.userCascadeReady !== true
    || state.userRequestUniqueReady !== true
    || state.expiryIndexReady !== true
    || !["0", "0::integer", "'0'::integer"].some(
      (value) => compactDefault(state.attemptDefault) === compactDefault(value)
    )
    || !timestampDefaultReady(state.createdDefault)
    || !timestampDefaultReady(state.updatedDefault)
  ) {
    throw new Error(INCOMPLETE_SCHEMA_MESSAGE);
  }
}

export const studioAiIdempotencySchemaPreflightProvider = {
  provide: STUDIO_AI_IDEMPOTENCY_SCHEMA_PREFLIGHT,
  useFactory: async (): Promise<true> => {
    await runSchemaPreflightToleratingDbUnavailability(
      "Studio AI idempotency schema preflight",
      () => preflightStudioAiIdempotencySchema()
    );
    return true;
  },
};
