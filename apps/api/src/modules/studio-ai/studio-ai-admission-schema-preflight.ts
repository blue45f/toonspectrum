import { matchesPostgresCheckDefinition } from "../../common/postgres-check-definition";
import { dbPool } from "../../db";

import type { Pool } from "pg";

export const STUDIO_AI_ADMISSION_SCHEMA_PREFLIGHT = Symbol(
  "STUDIO_AI_ADMISSION_SCHEMA_PREFLIGHT"
);

export const STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS: Readonly<
  Record<string, string>
> = {
  studio_ai_request_gate_request_times_check: `CHECK (
    cardinality("requestTimes") >= 0 AND cardinality("requestTimes") <= 10000
  )`,
  studio_ai_request_gate_lease_fence_check: `CHECK ("leaseFence" >= 0)`,
  studio_ai_request_gate_lease_state_check: `CHECK (
    ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
    OR (
      "leaseTokenHash" IS NOT NULL
      AND octet_length("leaseTokenHash") = 32
      AND "leaseExpiresAt" IS NOT NULL
    )
  )`,
};

interface StudioAiAdmissionSchemaRow {
  gateTable: string | null;
  requiredColumns: number | null;
  requestTimesType: string | null;
  requestTimesNotNull: boolean | null;
  requestTimesDefault: string | null;
  leaseTokenType: string | null;
  leaseTokenNullable: boolean | null;
  leaseFenceType: string | null;
  leaseFenceNotNull: boolean | null;
  leaseFenceDefault: string | null;
  leaseExpiryType: string | null;
  leaseExpiryNullable: boolean | null;
  createdAtType: string | null;
  createdAtNotNull: boolean | null;
  createdAtDefault: string | null;
  updatedAtType: string | null;
  updatedAtNotNull: boolean | null;
  updatedAtDefault: string | null;
  primaryKeyReady: boolean | null;
  userCascadeReady: boolean | null;
  requestTimesConstraintReady: boolean | null;
  leaseFenceConstraintReady: boolean | null;
  leaseStateConstraintReady: boolean | null;
  requestTimesConstraintDefinition: string | null;
  leaseFenceConstraintDefinition: string | null;
  leaseStateConstraintDefinition: string | null;
}

type QueryablePool = Pick<Pool, "query">;

function compactDefault(value: string | null): string {
  return value?.replace(/[\s()]+/gu, "").toLowerCase() ?? "";
}

function requestTimesDefaultReady(value: string | null): boolean {
  const normalized = compactDefault(value);
  return normalized === "'{}'::timestampwithtimezone[]" || normalized === "'{}'::timestamptz[]";
}

function leaseFenceDefaultReady(value: string | null): boolean {
  return /^(?:0|'0'::bigint|0::bigint)$/u.test(compactDefault(value));
}

function timestampDefaultReady(value: string | null): boolean {
  return ["current_timestamp", "now", "transaction_timestamp"].includes(compactDefault(value));
}

function checkDefinitionReady(name: string, actual: string | null): boolean {
  const canonical = STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS[name];
  return canonical !== undefined && matchesPostgresCheckDefinition(actual, canonical);
}

/** Refuse API boot before any Studio AI request can bypass the shared cost gate. */
export async function preflightStudioAiAdmissionSchema(
  pool: QueryablePool = dbPool
): Promise<void> {
  const schema = await pool.query<StudioAiAdmissionSchemaRow>(`
    SELECT
      to_regclass('public.studio_ai_request_gate')::text AS "gateTable",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = ANY (ARRAY[
            'userId', 'requestTimes', 'leaseTokenHash', 'leaseFence',
            'leaseExpiresAt', 'createdAt', 'updatedAt'
          ])
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS "requiredColumns",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'requestTimes'
      ) AS "requestTimesType",
      (
        SELECT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'requestTimes'
      ) AS "requestTimesNotNull",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'requestTimes'
      ) AS "requestTimesDefault",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseTokenHash'
      ) AS "leaseTokenType",
      (
        SELECT NOT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseTokenHash'
      ) AS "leaseTokenNullable",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseFence'
      ) AS "leaseFenceType",
      (
        SELECT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseFence'
      ) AS "leaseFenceNotNull",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseFence'
      ) AS "leaseFenceDefault",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseExpiresAt'
      ) AS "leaseExpiryType",
      (
        SELECT NOT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'leaseExpiresAt'
      ) AS "leaseExpiryNullable",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'createdAt'
      ) AS "createdAtType",
      (
        SELECT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'createdAt'
      ) AS "createdAtNotNull",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'createdAt'
      ) AS "createdAtDefault",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'updatedAt'
      ) AS "updatedAtType",
      (
        SELECT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'updatedAt'
      ) AS "updatedAtNotNull",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
          AND attribute.attname = 'updatedAt'
      ) AS "updatedAtDefault",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.contype = 'p'
          AND constraint_record.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
                AND attribute.attname = 'userId'
                AND NOT attribute.attisdropped
            )
          ]::smallint[]
          AND constraint_record.convalidated
      ) AS "primaryKeyReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.contype = 'f'
          AND constraint_record.confrelid = to_regclass('public."user"')
          AND constraint_record.confdeltype = 'c'
          AND constraint_record.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
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
      ) AS "userCascadeReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_request_times_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
          AND constraint_record.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
                AND attribute.attname = 'requestTimes'
                AND NOT attribute.attisdropped
            )
          ]::smallint[]
      ) AS "requestTimesConstraintReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_lease_fence_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
          AND constraint_record.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
                AND attribute.attname = 'leaseFence'
                AND NOT attribute.attisdropped
            )
          ]::smallint[]
      ) AS "leaseFenceConstraintReady",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_lease_state_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
          AND cardinality(constraint_record.conkey) = 2
          AND constraint_record.conkey @> ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
                AND attribute.attname = 'leaseTokenHash'
                AND NOT attribute.attisdropped
            ),
            (
              SELECT attribute.attnum
              FROM pg_catalog.pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass('public.studio_ai_request_gate')
                AND attribute.attname = 'leaseExpiresAt'
              AND NOT attribute.attisdropped
            )
          ]::smallint[]
      ) AS "leaseStateConstraintReady",
      (
        SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_request_times_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
      ) AS "requestTimesConstraintDefinition",
      (
        SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_lease_fence_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
      ) AS "leaseFenceConstraintDefinition",
      (
        SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = to_regclass('public.studio_ai_request_gate')
          AND constraint_record.conname = 'studio_ai_request_gate_lease_state_check'
          AND constraint_record.contype = 'c'
          AND constraint_record.convalidated
      ) AS "leaseStateConstraintDefinition"
  `);
  const state = schema.rows[0];
  if (
    !state?.gateTable ||
    state.requiredColumns !== 7 ||
    state.requestTimesType !== "timestamp with time zone[]" ||
    state.requestTimesNotNull !== true ||
    !requestTimesDefaultReady(state.requestTimesDefault) ||
    state.leaseTokenType !== "bytea" ||
    state.leaseTokenNullable !== true ||
    state.leaseFenceType !== "bigint" ||
    state.leaseFenceNotNull !== true ||
    !leaseFenceDefaultReady(state.leaseFenceDefault) ||
    state.leaseExpiryType !== "timestamp with time zone" ||
    state.leaseExpiryNullable !== true ||
    state.createdAtType !== "timestamp with time zone" ||
    state.createdAtNotNull !== true ||
    !timestampDefaultReady(state.createdAtDefault) ||
    state.updatedAtType !== "timestamp with time zone" ||
    state.updatedAtNotNull !== true ||
    !timestampDefaultReady(state.updatedAtDefault) ||
    state.primaryKeyReady !== true ||
    state.userCascadeReady !== true ||
    state.requestTimesConstraintReady !== true ||
    state.leaseFenceConstraintReady !== true ||
    state.leaseStateConstraintReady !== true ||
    !checkDefinitionReady(
      "studio_ai_request_gate_request_times_check",
      state.requestTimesConstraintDefinition
    ) ||
    !checkDefinitionReady(
      "studio_ai_request_gate_lease_fence_check",
      state.leaseFenceConstraintDefinition
    ) ||
    !checkDefinitionReady(
      "studio_ai_request_gate_lease_state_check",
      state.leaseStateConstraintDefinition
    )
  ) {
    throw new Error(
      "Studio AI admission schema is incomplete; apply migration 0018_studio_ai_request_gate.sql before starting the API"
    );
  }
}

export const studioAiAdmissionSchemaPreflightProvider = {
  provide: STUDIO_AI_ADMISSION_SCHEMA_PREFLIGHT,
  useFactory: async (): Promise<true> => {
    await preflightStudioAiAdmissionSchema();
    return true;
  },
};
