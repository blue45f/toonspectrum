#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { loadMigrationManifest } from "./run-production-database-migrations.mjs";
import {
  createPsqlEnvironment,
  validateProductionDatabaseUrl,
} from "./validate-production-database-url.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const HEALTH_READINESS_SOURCE = resolve(
  REPOSITORY_ROOT,
  "apps/api/src/modules/health/health-readiness.repository.ts",
);
const ADOPTION_MARKER_ID = "__managed_history_through_0019__";
const ADOPTION_BASELINE_SEQUENCE = 19;

const EXPECTED_SPECIAL_CAPABILITIES = Object.freeze([
  "commentActivityReanchorReady",
  "commentMutationMessageNullable",
  "commentMutationReanchorReady",
  "marketplaceSearchGenerated",
  "marketplaceSearchIndexReady",
  "marketplaceTagIndexReady",
  "relationNames",
  "trigramExtensionReady",
]);

function fail(message, cause) {
  throw new Error(message, cause ? { cause } : undefined);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function validateRuntimeDatabaseRole(runtimeDatabaseRole) {
  if (
    typeof runtimeDatabaseRole !== "string" ||
    !/^[a-z_][a-z0-9_]{0,62}$/u.test(runtimeDatabaseRole)
  ) {
    fail(
      "Runtime database role must be an explicit lowercase PostgreSQL role name",
    );
  }
  return runtimeDatabaseRole;
}

function extractQuotedValues(source, exportName) {
  const pattern = new RegExp(
    `export const ${exportName} = \\[([\\s\\S]*?)\\] as const`,
    "u",
  );
  const block = pattern.exec(source)?.[1];
  if (!block) fail(`Unable to read ${exportName} from health readiness source`);
  return [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

function extractSpecialCapabilities(source) {
  const block = /interface SchemaCatalogRow \{([\s\S]*?)\n\}/u.exec(source)?.[1];
  if (!block) fail("Unable to read SchemaCatalogRow from health readiness source");
  return [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gmu)]
    .map((match) => match[1])
    .sort();
}

export function loadHealthReadinessContract(
  sourcePath = HEALTH_READINESS_SOURCE,
) {
  const source = readFileSync(sourcePath, "utf8");
  const relationNames = extractQuotedValues(
    source,
    "REQUIRED_DATABASE_RELATIONS",
  );
  const migrationIds = extractQuotedValues(
    source,
    "REQUIRED_DATABASE_MIGRATIONS",
  );
  const specialCapabilities = extractSpecialCapabilities(source);
  if (
    specialCapabilities.length !== EXPECTED_SPECIAL_CAPABILITIES.length ||
    specialCapabilities.some(
      (capability, index) =>
        capability !== EXPECTED_SPECIAL_CAPABILITIES[index],
    )
  ) {
    fail(
      "Health readiness special capability contract changed; update the production verifier in the same release",
    );
  }
  return Object.freeze({
    relationNames: Object.freeze(relationNames),
    migrationIds: Object.freeze(migrationIds),
    specialCapabilities: Object.freeze(specialCapabilities),
  });
}

function adoptionMarkerChecksum(manifest) {
  const value = manifest
    .filter((migration) => migration.sequence <= ADOPTION_BASELINE_SEQUENCE)
    .map((migration) => `${migration.id}:${migration.checksum}\n`)
    .join("");
  return createHash("sha256").update(value).digest("hex");
}

function expectedMigrationProvenance(migration) {
  if (migration.sequence <= ADOPTION_BASELINE_SEQUENCE) return "adopted";
  if (migration.id === "0023_production_migration_ledger") return "bootstrap";
  return "executed";
}

export function buildProductionCapabilityVerificationSql(
  runtimeDatabaseRole,
) {
  validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const readiness = loadHealthReadinessContract();
  const manifest = loadMigrationManifest();
  const expectedRelations = readiness.relationNames
    .map((name) => sqlLiteral(name))
    .join(",\n          ");
  const requiredCutovers = readiness.migrationIds
    .map((id) => sqlLiteral(id))
    .join(",\n          ");
  const expectedLedgerRows = [
    ...manifest.map(({ id, checksum, sequence }) => [
      id,
      checksum,
      expectedMigrationProvenance({ id, sequence }),
    ]),
    [
      ADOPTION_MARKER_ID,
      adoptionMarkerChecksum(manifest),
      "adopted",
    ],
  ]
    .map(
      ([id, migrationChecksum, provenance]) =>
        `(${sqlLiteral(id)}, ${sqlLiteral(migrationChecksum)}, ${sqlLiteral(provenance)})`,
    )
    .join(",\n          ");

  return `
DO $toonspectrum_readiness$
DECLARE
  missing_relations text[];
  missing_cutovers text[];
  invalid_ledger_rows text[];
  unexpected_ledger_rows text[];
BEGIN
  SELECT array_agg(required_relation ORDER BY required_relation)
  INTO missing_relations
  FROM unnest(ARRAY[
          ${expectedRelations}
       ]::text[]) AS required_relation
  WHERE to_regclass(format('public.%I', required_relation)) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION 'required product relations are missing: %', missing_relations;
  END IF;

  SELECT array_agg(required_migration ORDER BY required_migration)
  INTO missing_cutovers
  FROM unnest(ARRAY[
          ${requiredCutovers}
       ]::text[]) AS required_migration
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.toonspectrum_schema_migration AS applied_cutover
    WHERE applied_cutover."id" = required_migration
  );

  IF missing_cutovers IS NOT NULL THEN
    RAISE EXCEPTION 'required destructive cutover markers are missing: %', missing_cutovers;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass('public.creator_marketplace_resource')
      AND attribute.attname = 'searchText'
      AND attribute.attgenerated = 's'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION 'marketplace generated searchText capability is missing';
  END IF;

  IF NOT EXISTS (
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
    WHERE index_record.relname = 'idx_creator_marketplace_resource_search'
      AND index_record.relkind = 'i'
      AND index_namespace.nspname = 'public'
      AND indexed_table.relname = 'creator_marketplace_resource'
      AND table_namespace.nspname = 'public'
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
          ON owning_extension.oid = extension_dependency.refobjid
        WHERE extension_dependency.classid = 'pg_catalog.pg_opclass'::regclass
          AND extension_dependency.objid = operator_class.oid
          AND extension_dependency.refclassid = 'pg_catalog.pg_extension'::regclass
          AND extension_dependency.deptype = 'e'
          AND owning_extension.extname = 'pg_trgm'
      )
  ) THEN
    RAISE EXCEPTION 'marketplace trigram search index capability is missing';
  END IF;

  IF NOT EXISTS (
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
      ON operator_namespace.oid = operator_class.opcnamespace
    WHERE index_record.relname = 'idx_creator_marketplace_resource_tags'
      AND index_record.relkind = 'i'
      AND index_namespace.nspname = 'public'
      AND indexed_table.relname = 'creator_marketplace_resource'
      AND table_namespace.nspname = 'public'
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
  ) THEN
    RAISE EXCEPTION 'marketplace JSONB tag index capability is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      to_regclass('public.creator_work_team_comment_activity')
      AND constraint_record.conname =
        'creator_work_team_comment_activity_action_check'
      AND pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        LIKE '%reanchored%'
  ) THEN
    RAISE EXCEPTION 'team-comment activity reanchor capability is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      to_regclass('public.creator_work_team_comment_mutation')
      AND constraint_record.conname =
        'creator_work_team_comment_mutation_operation_check'
      AND pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        LIKE '%thread_reanchor%'
  ) THEN
    RAISE EXCEPTION 'team-comment mutation reanchor capability is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid =
      to_regclass('public.creator_work_team_comment_mutation')
      AND attribute.attname = 'messageId'
      AND attribute.attnotnull = false
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION 'team-comment nullable mutation message capability is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION 'pg_trgm extension is missing';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'purpose',
        'digest',
        'contractVersion',
        'objectPath',
        'byteLength',
        'contentType'
      ]::text[]) AS insert_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_asset_storage_object',
        insert_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'createdAt',
        'updatedAt',
        'deletedAt'
      ]::text[]) AS default_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_asset_storage_object',
        default_column,
        'INSERT'
      )
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'state',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'deleteToken',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'updatedAt',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_asset_storage_object',
      'deletedAt',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'purpose',
        'digest',
        'contractVersion',
        'objectPath',
        'byteLength',
        'contentType',
        'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_asset_storage_object',
        immutable_column,
        'UPDATE'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'DELETE'
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'purpose',
        'referenceId',
        'objectDigest',
        'sourceAssetId',
        'createdBy'
      ]::text[]) AS insert_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_work_asset_storage_reference',
        insert_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'createdAt',
        'updatedAt'
      ]::text[]) AS default_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_work_asset_storage_reference',
        default_column,
        'INSERT'
      )
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'state',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'deleteToken',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public.creator_work_asset_storage_reference',
      'updatedAt',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'purpose',
        'referenceId',
        'objectDigest',
        'sourceAssetId',
        'createdBy',
        'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(runtimeDatabaseRole)},
        'public.creator_work_asset_storage_reference',
        immutable_column,
        'UPDATE'
      )
    ) THEN
    RAISE EXCEPTION
      'runtime role lacks the exact creator object-storage privileges';
  END IF;

  IF to_regclass('toonspectrum_ops.deployment_migration') IS NULL
    OR to_regclass('toonspectrum_ops.deployment_migration_lock') IS NULL THEN
    RAISE EXCEPTION 'deployment migration ledger capability is missing';
  END IF;

  IF current_user = ${sqlLiteral(runtimeDatabaseRole)}
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = ${sqlLiteral(runtimeDatabaseRole)}
        AND NOT rolsuper
        AND NOT rolcreaterole
        AND NOT rolcreatedb
        AND NOT rolreplication
        AND NOT rolbypassrls
        AND rolcanlogin
    )
    OR pg_catalog.pg_has_role(
      ${sqlLiteral(runtimeDatabaseRole)},
      current_user,
      'MEMBER'
    )
    OR NOT pg_catalog.has_database_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      current_database(),
      'CONNECT'
    )
    OR NOT pg_catalog.has_schema_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'public',
      'USAGE'
    ) THEN
    RAISE EXCEPTION
      'runtime and migration database roles are not safely separated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner
      ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'toonspectrum_ops'
      AND relation.relname IN (
        'deployment_migration',
        'deployment_migration_lock'
      )
      AND owner.rolname = ${sqlLiteral(runtimeDatabaseRole)}
  ) THEN
    RAISE EXCEPTION 'runtime database role owns the migration ledger';
  END IF;

  IF pg_catalog.has_schema_privilege(
    ${sqlLiteral(runtimeDatabaseRole)},
    'toonspectrum_ops',
    'USAGE'
  ) OR pg_catalog.has_schema_privilege(
    ${sqlLiteral(runtimeDatabaseRole)},
    'toonspectrum_ops',
    'CREATE'
  ) THEN
    RAISE EXCEPTION
      'runtime database role retains migration schema privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]::text[]) AS privilege_name
    WHERE pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'toonspectrum_ops.deployment_migration',
      privilege_name
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(runtimeDatabaseRole)},
      'toonspectrum_ops.deployment_migration_lock',
      privilege_name
    )
  ) THEN
    RAISE EXCEPTION
      'runtime database role retains migration ledger privileges';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = to_regclass('toonspectrum_ops.deployment_migration')
      AND (
        (contype = 'p' AND conname = 'deployment_migration_pkey')
        OR (
          contype = 'c'
          AND conname = ANY(ARRAY[
            'deployment_migration_id_check',
            'deployment_migration_checksum_check',
            'deployment_migration_state_check',
            'deployment_migration_provenance_check',
            'deployment_migration_release_sha_check',
            'deployment_migration_state_time_check',
            'deployment_migration_provenance_state_check'
          ]::text[])
        )
      )
  ) <> 8 THEN
    RAISE EXCEPTION 'deployment migration ledger constraints are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = to_regclass('toonspectrum_ops.deployment_migration_lock')
      AND (
        (contype = 'p' AND conname = 'deployment_migration_lock_pkey')
        OR (
          contype = 'c'
          AND conname = ANY(ARRAY[
            'deployment_migration_lock_singleton_check',
            'deployment_migration_lock_owner_token_check',
            'deployment_migration_lock_release_sha_check'
          ]::text[])
        )
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'deployment migration lock constraints are incomplete';
  END IF;

  WITH expected("id", "checksum", "provenance") AS (
    VALUES
          ${expectedLedgerRows}
  )
  SELECT array_agg(expected."id" ORDER BY expected."id")
  INTO invalid_ledger_rows
  FROM expected
  LEFT JOIN toonspectrum_ops.deployment_migration AS applied
    ON applied."id" = expected."id"
  WHERE applied."id" IS NULL
    OR applied."checksum" <> expected."checksum"
    OR applied."state" <> 'applied'
    OR applied."provenance" <> expected."provenance"
    OR applied."appliedAt" IS NULL;

  IF invalid_ledger_rows IS NOT NULL THEN
    RAISE EXCEPTION 'migration ledger is missing exact applied checksums: %',
      invalid_ledger_rows;
  END IF;

  WITH expected("id", "checksum", "provenance") AS (
    VALUES
          ${expectedLedgerRows}
  )
  SELECT array_agg(applied."id" ORDER BY applied."id")
  INTO unexpected_ledger_rows
  FROM toonspectrum_ops.deployment_migration AS applied
  LEFT JOIN expected
    ON expected."id" = applied."id"
  WHERE expected."id" IS NULL;

  IF unexpected_ledger_rows IS NOT NULL THEN
    RAISE EXCEPTION 'migration ledger contains entries outside the reviewed manifest: %',
      unexpected_ledger_rows;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM toonspectrum_ops.deployment_migration
    WHERE "state" <> 'applied'
  ) THEN
    RAISE EXCEPTION 'migration ledger contains interrupted or failed rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM toonspectrum_ops.deployment_migration_lock
  ) THEN
    RAISE EXCEPTION 'migration runner lock was not released';
  END IF;
END
$toonspectrum_readiness$;
`;
}

function parseArguments(argv) {
  let runtimeDatabaseRole = "";
  let allowLoopback = false;
  let runtimeRoleSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-loopback") {
      if (allowLoopback) fail("Duplicate verifier argument: --allow-loopback");
      allowLoopback = true;
      continue;
    }
    if (argument !== "--runtime-database-role") {
      fail(`Unknown verifier argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("Verifier argument --runtime-database-role requires a value");
    }
    if (runtimeRoleSeen) {
      fail("Duplicate verifier argument: --runtime-database-role");
    }
    runtimeDatabaseRole = value;
    runtimeRoleSeen = true;
    index += 1;
  }
  validateRuntimeDatabaseRole(runtimeDatabaseRole);
  return { allowLoopback, runtimeDatabaseRole };
}

export function verifyProductionDatabaseCapabilities({
  databaseUrl,
  runtimeDatabaseRole,
  allowLoopback = false,
}) {
  validateProductionDatabaseUrl(databaseUrl, { allowLoopback });
  validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: createPsqlEnvironment(databaseUrl, {
      allowLoopback: true,
      baseEnvironment: { ...process.env, PSQLRC: "/dev/null" },
    }),
    input: buildProductionCapabilityVerificationSql(runtimeDatabaseRole),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) fail("Unable to execute psql", result.error);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    fail(
      details
        ? `Production database capability verification failed: ${details}`
        : "Production database capability verification failed",
    );
  }
  process.stdout.write("Production database capabilities: verified\n");
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  verifyProductionDatabaseCapabilities({
    databaseUrl:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.PRODUCTION_DATABASE_DIRECT_URL,
    ...options,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Production capability verification failed"}\n`,
    );
    process.exitCode = 1;
  }
}
